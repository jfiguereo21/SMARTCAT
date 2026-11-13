"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { necesitaMiAccion, type FondoMov } from "@/lib/fondo";

type Seccion = "maquinas" | "conduces" | "combustible" | "horometro" | "mantenimiento" | "acuerdos" | "trabajos" | "operadores" | "pagos" | "fondo" | "corte" | "metas";

export default function Nav({ activa }: { activa: Seccion }) {
  const [correo, setCorreo] = useState("");
  const [porAprobar, setPorAprobar] = useState(0);
  const [gasoilPorAprobar, setGasoilPorAprobar] = useState(0);
  const [fallasNuevas, setFallasNuevas] = useState(0);
  const [fondoEspera, setFondoEspera] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setCorreo(data.user?.email ?? "");
      const uid = data.user?.id ?? "";
      // Movimientos del fondo que esperan algo de mí: aprobar lo del otro socio o pagar lo aprobado.
      supabase
        .from("fondo_movimientos")
        .select("*")
        .is("rechazado_en", null)
        .or("aprobado_en.is.null,pagado_en.is.null")
        .then(({ data: movs }) =>
          setFondoEspera(((movs ?? []) as FondoMov[]).filter((m) => necesitaMiAccion(m, uid)).length)
        );
    });
    // Cuántos conduces esperan tu aprobación.
    supabase
      .from("conduces")
      .select("id", { count: "exact", head: true })
      .eq("estado", "Pendiente")
      .then(({ count }) => setPorAprobar(count ?? 0));
    // Cuánto combustible reportado por operadores espera tu aprobación.
    supabase
      .from("fuel_logs")
      .select("id", { count: "exact", head: true })
      .eq("estado", "Pendiente")
      .then(({ count }) => setGasoilPorAprobar(count ?? 0));
    // Cuántas fallas reportadas por operadores todavía no has tomado.
    supabase
      .from("reportes_falla")
      .select("id", { count: "exact", head: true })
      .eq("estado", "Nuevo")
      .then(({ count }) => setFallasNuevas(count ?? 0));
  }, []);

  async function salir() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  const tab = (href: string, seccion: Seccion, texto: string, extra?: string) => (
    <Link href={href} className={activa === seccion ? "tab on" : "tab"}>
      {texto}
      {extra}
    </Link>
  );

  return (
    <header className="nav">
      <nav className="tabs">
        {tab("/", "maquinas", "Máquinas")}
        {tab("/conduces", "conduces", "Conduces", porAprobar > 0 ? ` (${porAprobar})` : "")}
        {tab("/combustible", "combustible", "Combustible", gasoilPorAprobar > 0 ? ` (${gasoilPorAprobar})` : "")}
        {tab("/horometro", "horometro", "Horómetro")}
        {tab("/mantenimiento", "mantenimiento", "Mantenimiento", fallasNuevas > 0 ? ` (${fallasNuevas})` : "")}
        {tab("/acuerdos", "acuerdos", "Acuerdos")}
        {tab("/trabajos", "trabajos", "Trabajos")}
        {tab("/operadores", "operadores", "Operadores")}
        {tab("/corte", "corte", "Corte")}
        {tab("/metas", "metas", "Metas")}
        {tab("/pagos", "pagos", "Pagos")}
        {tab("/fondo", "fondo", "Fondo", fondoEspera > 0 ? ` (${fondoEspera})` : "")}
      </nav>
      <div className="who">
        <span>{correo}</span>
        <button className="btn small" onClick={salir}>
          Salir
        </button>
      </div>
    </header>
  );
}
