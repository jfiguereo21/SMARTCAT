"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("e") === "sin-acceso")
      setError("Tu usuario no tiene acceso. Habla con el administrador.");
  }, []);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    if (error) {
      setError("Correo o clave incorrectos.");
      setCargando(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="login">
      <h1>SmartCat</h1>
      <p className="line" style={{ marginTop: 0, marginBottom: 20 }}>
        Control de maquinaria FIPEC
      </p>
      <form onSubmit={entrar}>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label htmlFor="correo">Correo</label>
          <input
            id="correo"
            type="email"
            autoComplete="username"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="clave">Clave</label>
          <input
            id="clave"
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
          />
        </div>
        <button className="btn primary" style={{ width: "100%" }} disabled={cargando}>
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
