import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Sin sesión: a /login. Con sesión: el operador solo entra a /operador; el administrador a todo.
// La seguridad de verdad está en la base de datos (permisos por rol); esto solo lleva a cada quien a su pantalla.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const enLogin = ruta === "/login";
  const irA = (path: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    return NextResponse.redirect(url);
  };

  if (!user) return enLogin ? response : irA("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("rol, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  // Usuario sin perfil o desactivado: se cierra la sesión.
  if (!perfil || !perfil.activo) {
    if (enLogin) return response;
    await supabase.auth.signOut();
    const salida = irA("/login", { e: "sin-acceso" });
    response.cookies.getAll().forEach((c) => salida.cookies.set(c));
    return salida;
  }

  const inicio = perfil.rol === "operador" ? "/operador" : "/";
  if (enLogin) return irA(inicio);
  if (perfil.rol === "operador" && !ruta.startsWith("/operador")) return irA("/operador");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
