"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Cli = { id: string; nombre: string };
const NUEVO = "__nuevo__";

// Lista de clientes con la opción "Nuevo cliente", para crearlo ahí mismo sin salir de la pantalla.
export default function ClienteSelect({
  id,
  clientes,
  value,
  onChange,
  vacio = "Sin cliente todavía",
}: {
  id: string;
  clientes: Cli[];
  value: string;
  onChange: (clientId: string) => void;
  vacio?: string;
}) {
  const [creados, setCreados] = useState<Cli[]>([]);
  const [nuevo, setNuevo] = useState(false);
  const [nombre, setNombre] = useState("");
  const [rnc, setRnc] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const todos = [...clientes, ...creados.filter((c) => !clientes.some((x) => x.id === c.id))].sort((a, b) =>
    a.nombre.localeCompare(b.nombre)
  );

  async function guardar() {
    const n = nombre.trim();
    if (n === "") return setError("Escribe el nombre del cliente.");
    const igual = todos.find((c) => c.nombre.trim().toLowerCase() === n.toLowerCase());
    if (igual) {
      setNuevo(false);
      setNombre("");
      setRnc("");
      return onChange(igual.id);
    }
    setError("");
    setGuardando(true);
    const { data, error: e } = await createClient()
      .from("clients")
      .insert({ nombre: n, rnc: rnc.trim() || null })
      .select("id, nombre")
      .single();
    setGuardando(false);
    if (e || !data) return setError(`No se pudo guardar el cliente: ${e?.message ?? "error"}`);
    setCreados((prev) => [...prev, data as Cli]);
    setNuevo(false);
    setNombre("");
    setRnc("");
    onChange((data as Cli).id);
  }

  return (
    <>
      <select
        id={id}
        value={nuevo ? NUEVO : value}
        onChange={(e) => {
          if (e.target.value === NUEVO) {
            setNuevo(true);
            setError("");
          } else {
            setNuevo(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">{vacio}</option>
        {todos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
        <option value={NUEVO}>+ Nuevo cliente…</option>
      </select>
      {nuevo && (
        <div className="resumen" style={{ marginTop: 8 }}>
          <b>Nuevo cliente</b>
          {error && <div className="error">{error}</div>}
          <div className="field" style={{ marginTop: 8 }}>
            <label htmlFor={`${id}-nombre`}>Nombre</label>
            <input
              id={`${id}-nombre`}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
              }}
            />
          </div>
          <div className="field">
            <label htmlFor={`${id}-rnc`}>RNC o cédula (opcional)</label>
            <input
              id={`${id}-rnc`}
              inputMode="numeric"
              value={rnc}
              onChange={(e) => setRnc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  guardar();
                }
              }}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn primary" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando..." : "Guardar cliente"}
            </button>
            <button type="button" className="btn" onClick={() => setNuevo(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
