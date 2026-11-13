import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Crea la cuenta de un operador sin entrar a Supabase.
// Solo un administrador activo puede usarla. La llave de servicio vive solo en el servidor (Vercel), nunca en el celular.
export async function POST(req: Request) {
  const falla = (error: string, status: number) => NextResponse.json({ error }, { status });

  // 1. Quién llama: tiene que ser administrador activo.
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return falla("Tu sesión se cerró. Entra otra vez.", 401);
  const { data: yo } = await supabase.from("perfiles").select("rol, activo").eq("user_id", u.user.id).maybeSingle();
  if (!yo || yo.rol !== "admin" || !yo.activo) return falla("Solo el administrador puede crear usuarios.", 403);

  // 2. Los datos.
  let body: { nombre?: string; email?: string; password?: string; pagado_por_dueno?: boolean; maquinas?: string[] };
  try {
    body = await req.json();
  } catch {
    return falla("No se entendió lo que se envió.", 400);
  }
  const nombre = (body.nombre ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const maquinas = Array.isArray(body.maquinas) ? body.maquinas.filter((x) => typeof x === "string") : [];
  if (nombre === "") return falla("Ponle el nombre del operador.", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return falla("El correo no es válido. Ejemplo: robertomercedes@gmail.com", 400);
  if (password.length < 6) return falla("La clave tiene que tener al menos 6 caracteres.", 400);

  // 3. La llave de servicio.
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!llave) return falla("Falta configurar la llave de servicio en Vercel (SUPABASE_SERVICE_ROLE_KEY).", 500);
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, llave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Crear el usuario. Un disparador de la base le crea el perfil de operador.
  const { data: nuevo, error: e1 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (e1 || !nuevo.user) {
    const ya = /already|registered|exists/i.test(e1?.message ?? "");
    return falla(ya ? "Ya existe un usuario con ese correo." : `No se pudo crear el usuario: ${e1?.message ?? "error"}`, ya ? 409 : 500);
  }
  const id = nuevo.user.id;
  const deshacer = async (msg: string) => {
    await admin.auth.admin.deleteUser(id);
    return falla(msg, 500);
  };

  // 5. Nombre, quién lo paga y máquinas que puede reportar.
  const { error: e2 } = await admin
    .from("perfiles")
    .update({ nombre, rol: "operador", activo: true, pagado_por_dueno: body.pagado_por_dueno === true })
    .eq("user_id", id);
  if (e2) return deshacer(`No se pudo guardar el perfil: ${e2.message}`);

  if (maquinas.length > 0) {
    const { data: ms, error: e3 } = await admin.from("machines").select("id, nombre").in("id", maquinas);
    if (e3) return deshacer(`No se pudieron leer las máquinas: ${e3.message}`);
    const filas = (ms ?? []).map((m) => ({ user_id: id, machine_id: m.id, maquina_nombre: m.nombre }));
    if (filas.length > 0) {
      const { error: e4 } = await admin.from("operador_maquinas").insert(filas);
      if (e4) return deshacer(`No se pudieron asignar las máquinas: ${e4.message}`);
    }
  }

  return NextResponse.json({ ok: true, user_id: id });
}
