"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Seccion = "maquinas" | "conduces" | "combustible" | "acuerdos" | "operadores";

export default function Nav({ activa }: { activa: Seccion }) {
  const [correo, setCorreo] = useState("");
  const [porAprobar, setPorAprobar] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setCorreo(data.user?.email ?? ""));
    // Cuántos conduces esperan tu aprobación.
    supabase
      .from("conduces")
      .select("id", { count: "exact", head: true })
      .eq("estado", "Pendiente")
      .then(({ count }) => setPorAprobar(count ?? 0));
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
        {tab("/combustible", "combustible", "Combustible")}
        {tab("/acuerdos", "acuerdos", "Acuerdos")}
        {tab("/operadores", "operadores", "Operadores")}
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
