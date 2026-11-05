"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Nav({ activa }: { activa: "maquinas" | "conduces" }) {
  const [correo, setCorreo] = useState("");

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setCorreo(data.user?.email ?? ""));
  }, []);

  async function salir() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="nav">
      <nav className="tabs">
        <Link href="/" className={activa === "maquinas" ? "tab on" : "tab"}>
          Máquinas
        </Link>
        <Link href="/conduces" className={activa === "conduces" ? "tab on" : "tab"}>
          Conduces
        </Link>
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
