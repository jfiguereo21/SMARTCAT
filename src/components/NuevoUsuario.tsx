"use client";

import { useState } from "react";
import type { Machine } from "@/lib/machines";

// Crea la cuenta de un operador desde la app (sin entrar a Supabase).
export default function NuevoUsuario({
  maquinas,
  onClose,
  onCreated,
}: {
  maquinas: Machine[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [pagadoPorDueno, setPagadoPorDueno] = useState(false);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [listo, setListo] = useState<{ email: string; clave: string } | null>(null);

  const alternar = (id: string) =>
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nombre.trim() === "") return setError("Ponle el nombre del operador.");
    if (email.trim() === "") return setError("Ponle un correo (es con el que entra). Ejemplo: robertomercedes@gmail.com");
    if (clave.length < 6) return setError("La clave tiene que tener al menos 6 caracteres.");
    setGuardando(true);
    try {
      const r = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          email,
          password: clave,
          pagado_por_dueno: pagadoPorDueno,
          maquinas: elegidas,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setError(j.error ?? "No se pudo crear el usuario.");
      else setListo({ email: email.trim().toLowerCase(), clave });
    } catch {
      setError("No se pudo conectar. Revisa el internet e intenta otra vez.");
    }
    setGuardando(false);
  }

  if (listo) {
    return (
      <div className="sheet-bg" onClick={onCreated}>
        <div className="sheet" onClick={(e) => e.stopPropagation()}>
          <h2>Usuario creado</h2>
          <div className="resumen" style={{ fontSize: 15 }}>
            <div>
              Nombre: <b>{nombre.trim()}</b>
            </div>
            <div>
              Correo: <b>{listo.email}</b>
            </div>
            <div>
              Clave: <b>{listo.clave}</b>
            </div>
          </div>
          <div className="hint">
            Dale el correo y la clave. Abre la app en su celular y entra. La clave no se vuelve a mostrar: anótala o
            mándasela ahora.
          </div>
          <div className="actions">
            <button type="button" className="btn primary grow" onClick={onCreated}>
              Listo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={crear}>
        <h2>Nuevo usuario</h2>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="nu-nombre">Nombre del operador</label>
          <input id="nu-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="nu-email">Correo (con el que entra)</label>
          <input
            id="nu-email"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="nu-clave">Clave (mínimo 6 caracteres)</label>
          <input id="nu-clave" value={clave} onChange={(e) => setClave(e.target.value)} />
        </div>

        <div className="field">
          <label>Máquinas que puede reportar</label>
          {maquinas.map((m) => (
            <label className="check" key={m.id}>
              <input type="checkbox" checked={elegidas.includes(m.id)} onChange={() => alternar(m.id)} />
              {m.nombre}
            </label>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={pagadoPorDueno} onChange={(e) => setPagadoPorDueno(e.target.checked)} />
          Lo paga el dueño de la máquina (yo no le pago)
        </label>
        <div className="hint">
          Se crea como operador. Después, en su tarjeta, puedes ponerle el precio por hora y el trato si lo pagas tú.
        </div>

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Creando..." : "Crear usuario"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
