"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtMonto, hoyRD, type Machine, type Moneda } from "@/lib/machines";
import { montoCarga, type FuelLog, type Origen } from "@/lib/combustible";

type Props = {
  carga: FuelLog | null; // null = carga nueva
  maquinas: Machine[];
  onClose: () => void;
  onSaved: () => void;
};

export default function FuelEditor({ carga, maquinas, onClose, onSaved }: Props) {
  const nueva = carga === null;
  const [origen, setOrigen] = useState<Origen>(carga?.origen ?? "Cliente");
  const [fecha, setFecha] = useState(carga?.fecha ?? hoyRD());
  const [machineId, setMachineId] = useState(carga?.machine_id ?? "");
  const [galones, setGalones] = useState(carga ? String(carga.galones) : "");
  const [precio, setPrecio] = useState(carga?.precio_galon != null ? String(carga.precio_galon) : "");
  const [moneda, setMoneda] = useState<Moneda>(carga?.moneda ?? "DOP");
  const [nota, setNota] = useState(carga?.nota ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const gNum = aNumero(galones);
  const pNum = aNumero(precio);
  const total =
    origen === "Propio" && gNum != null && gNum > 0 && pNum != null && pNum > 0
      ? montoCarga(gNum, pNum)
      : null;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) return setError("Falta la fecha.");
    if (!machineId) return setError("Escoge la máquina.");
    if (gNum == null || gNum <= 0) return setError("Escribe los galones, por ejemplo 25 o 12.5.");
    if (origen === "Propio" && (pNum == null || pNum <= 0))
      return setError("Escribe lo que pagaste por galón, por ejemplo 246.80.");

    setGuardando(true);
    const datos = {
      fecha,
      machine_id: machineId,
      origen,
      galones: gNum,
      // Si lo dio el cliente, el precio se pone el día 25 en la pantalla de Combustible.
      precio_galon: origen === "Propio" ? pNum : null,
      moneda: origen === "Propio" ? moneda : "DOP",
      nota: nota.trim() || null,
    };
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

        <div className="field">
          <label htmlFor="f-origen">¿Quién pagó el combustible?</label>
          <select id="f-origen" value={origen} onChange={(e) => setOrigen(e.target.value as Origen)}>
            <option value="Cliente">El cliente (me lo descuenta)</option>
            <option value="Propio">Yo (es gasto mío)</option>
          </select>
          {origen === "Cliente" && (
            <div className="hint">El precio del galón se pone el día 25, en la pantalla de Combustible.</div>
          )}
        </div>

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

        {origen === "Propio" && (
          <>
            <div className="grid2">
              <div className="field">
                <label htmlFor="f-precio">Precio por galón</label>
                <input id="f-precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="f-moneda">Moneda</label>
                <select id="f-moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
                  <option value="DOP">Pesos (RD$)</option>
                  <option value="USD">Dólares (US$)</option>
                </select>
              </div>
            </div>
            {total != null && (
              <div className="resumen">
                Gasto de esta carga: <b>{fmtMonto(total, moneda)}</b>
              </div>
            )}
          </>
        )}

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
