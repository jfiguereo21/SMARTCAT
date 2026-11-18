"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type SocioFondo = { user_id: string; nombre: string };

// Los socios (admin y socio) y quién está usando la app: sirven para escoger "de qué fondo sale" un pago.
export function useSociosFondo() {
  const [socios, setSocios] = useState<SocioFondo[]>([]);
  const [uid, setUid] = useState("");
  useEffect(() => {
    let vivo = true;
    (async () => {
      const supabase = createClient();
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("perfiles").select("user_id, nombre, activo").in("rol", ["admin", "socio"]);
      if (!vivo) return;
      setUid(u.user?.id ?? "");
      setSocios(
        ((data ?? []) as { user_id: string; nombre: string | null; activo: boolean | null }[])
          .filter((p) => p.activo !== false)
          .map((p) => ({ user_id: p.user_id, nombre: p.nombre || "Socio" }))
      );
    })();
    return () => {
      vivo = false;
    };
  }, []);
  return { socios, uid };
}
