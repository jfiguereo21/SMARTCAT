"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtNum, hoyRD } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { subirFoto, useFotoUrl } from "@/lib/fotos";
import type { FuelLog } from "@/lib/combustible";
import type { MaquinaOperador } from "@/components/OperadorForm";

type Props = {
  carga: FuelLog | null; // null = carga nueva
  uid: string;
  maquinas: MaquinaOperador[];
  onClose: () => void;
  onSaved: () => void;
};

// Pantalla del operador para reportar el combustible que echó a su máquina.
export default function FuelOperadorForm({ carga, uid, maquinas, onClose, onSaved }: Props) {
  const nueva = carga === null;
  const aprobada = carga?.estado === "Aprobado"; // ya aprobada: solo se mira

  const [machineId, setMachineId] = useState(carga?.machine_id ?? (maquinas.length === 1 ? maquinas[0].machine_id : ""));
  const [fecha, setFecha] = useState(carga?.fecha ?? hoyRD());
  const [galones, setGalones] = useState(carga ? String(carga.galones) : "");
  const [nota, setNota] = useState(carga?.nota ?? "");
  const [foto, setFoto] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const urlFoto = useFotoUrl(carga?.foto_path);
  const nombreMaquina = maquinas.find((m) => m.machine_id === machineId)?.maquina_nombre ?? "";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const gNum = aNumero(galones);
    if (!machineId) return setError("Escoge la máquina.");
    if (!fecha) return setError("Falta la fecha.");
    if (fecha > hoyRD()) return setError("La fecha no puede ser de un día que todavía no llega.");
    if (gNum == null || gNum <= 0) return setError("Escribe los galones, por ejemplo 25 o 12.5.");
    if (!foto && !carga?.foto_path) return setError("Sube la foto del comprobante o del vale del combustible.");

    setGuardando(true);
    try {
      let fotoPath = carga?.foto_path ?? null;
      if (foto) fotoPath = await subirFoto(foto, uid, `gasoil-${fecha}`);

      const supabase = createClient();
      const datos = {
        machine_id: machineId,
        fecha,
        galones: gNum,
        nota: nota.trim() || null,
        foto_path: fotoPath,
      };
      const { error: err } = nueva
        ? await supabase.from("fuel_logs").insert({ ...datos, creado_por: uid })
        : await supabase.from("fuel_logs").update(datos).eq("id", carga.id);
      if (err) {
        setGuardando(false);
        return setError(`No se pudo guardar: ${err.message}`);
      }
      setGuardando(false);
      onSaved();
    } catch (ex) {
      setGuardando(false);
      setError(ex instanceof Error ? ex.message : "No se pudo guardar.");
    }
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
        <h2>{nueva ? "Cargar combustible" : "Carga de combustible"}</h2>
        {error && <div className="error">{error}</div>}

        {carga?.estado === "Rechazado" && (
          <div className="alerta" style={{ marginBottom: 12 }}>
            El administrador la rechazó{carga.motivo_rechazo ? `: ${carga.motivo_rechazo}` : "."} Corrígela y vuelve a
            enviarla.
          </div>
        )}

        {aprobada ? (
          <>
            <div className="resumen">
              <div>{fmtFecha(carga.fecha)}</div>
              <div>
                Aprobada: <b>{fmtNum(carga.galones, 2)} galones</b>
              </div>
              {carga.nota && <div>{carga.nota}</div>}
            </div>
            {urlFoto && (
              <a href={urlFoto} target="_blank" rel="noreferrer">
                <img className="foto" src={urlFoto} alt="Comprobante" />
              </a>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="g-maq">Máquina</label>
              <select id="g-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                <option value="">Escoge la máquina</option>
                {maquinas.map((m) => (
                  <option key={m.machine_id} value={m.machine_id}>
                    {m.maquina_nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid2">
              <div className="field">
                <label htmlFor="g-fecha">Fecha</label>
                <input id="g-fecha" type="date" max={hoyRD()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="g-gal">Galones que echaste</label>
                <input id="g-gal" inputMode="decimal" value={galones} onChange={(e) => setGalones(e.target.value)} />
              </div>
            </div>

            <div className="field">
              <label htmlFor="g-foto">Foto del comprobante o vale del combustible</label>
              {urlFoto && !foto && (
                <a href={urlFoto} target="_blank" rel="noreferrer">
                  <img className="foto" src={urlFoto} alt="Comprobante" />
                </a>
              )}
              <input id="g-foto" type="file" accept="image/*" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
            </div>

            <div className="field">
              <label htmlFor="g-nota">Nota</label>
              <input id="g-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
              <div className="hint">Por ejemplo el número del vale o dónde lo echaste.</div>
            </div>
          </>
        )}

        <div className="actions">
          {!aprobada && (
            <button type="submit" className="btn primary grow" disabled={guardando}>
              {guardando ? "Enviando..." : nueva ? "Enviar" : "Guardar y enviar"}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            {aprobada ? "Cerrar" : "Cancelar"}
          </button>
          {!nueva && !aprobada && (
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
