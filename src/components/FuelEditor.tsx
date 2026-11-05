"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, hoyRD, type Machine } from "@/lib/machines";
import type { FuelLog } from "@/lib/combustible";

type Props = {
  carga: FuelLog | null; // null = carga nueva
  maquinas: Machine[];
  onClose: () => void;
  onSaved: () => void;
};

export default function FuelEditor({ carga, maquinas, onClose, onSaved }: Props) {
  const nueva = carga === null;
  const [fecha, setFecha] = useState(carga?.fecha ?? hoyRD());
  const [machineId, setMachineId] = useState(carga?.machine_id ?? "");
  const [galones, setGalones] = useState(carga ? String(carga.galones) : "");
  const [nota, setNota] = useState(carga?.nota ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const g = aNumero(galones);
    if (!fecha) return setError("Falta la fecha.");
    if (!machineId) return setError("Escoge la máquina.");
    if (g == null || g <= 0) return setError("Escribe los galones, por ejemplo 25 o 12.5.");

    setGuardando(true);
    const datos = { fecha, machine_id: machineId, galones: g, nota: nota.trim() || null };
    const supabase = createClient();
    const { error: err } = nueva
      ? await supabase.from("fuel_logs").insert(datos)
      : await supabase.from("fuel_logs").update(datos).eq("id", carga.id);
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    onSaved();
  }

  async function borrar() {
    if (!carga) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("fuel_logs").delete().eq("id", carga.id);
    setGuardando(false);
    if (err) return setError(`No se pudo borrar: ${err.message}`);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nueva ? "Carga de combustible" : "Editar carga"}</h2>
        {error && <div className="error">{error}</div>}

        <div className="grid2">
          <div className="field">
            <label htmlFor="f-fecha">Fecha</label>
            <input id="f-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="f-gal">Galones</label>
            <input id="f-gal" inputMode="decimal" value={galones} onChange={(e) => setGalones(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-maq">Máquina</label>
          <select id="f-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">Escoge la máquina</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="f-nota">Nota</label>
          <input id="f-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
          <div className="hint">Por ejemplo quién lo echó o el número del vale.</div>
        </div>

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {!nueva && (
            <button
              type="button"
              className={`btn danger${borrarListo ? " armed" : ""}`}
              onClick={borrar}
              disabled={guardando}
            >
              {borrarListo ? "Toca otra vez para borrar" : "Borrar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
