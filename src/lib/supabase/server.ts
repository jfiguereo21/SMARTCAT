import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente de Supabase para rutas del servidor: actúa con la sesión de quien llama.
export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return store.getAll();
        },
        setAll(lista) {
          try {
            lista.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // En rutas de solo lectura no se pueden escribir cookies; no importa aquí.
          }
        },
      },
    }
  );
}
