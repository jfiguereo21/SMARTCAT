"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtNum, hoyRD } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { subirFoto, useFotoUrl } from "@/lib/fotos";
import type { LecturaHoro } from "@/lib/horometro";
import type { MaquinaOperador } from "@/components/OperadorForm";

type Props = {
  lectura: LecturaHoro | null; // null = lectura nueva
  uid: string;
  maquinas: MaquinaOperador[];
  onClose: () => void;
  onSaved: () => void;
};

// Pantalla del operador para registrar lo que marca el horómetro, con la foto del reloj.
export default function HorometroOperadorForm({ lectura, uid, maquinas, onClose, onSaved }: Props) {
  const nueva = lectura === null;
  const aprobada = lectura?.estado === "Aprobado"; // ya aprobada: solo se mira

  const [machineId, setMachineId] = useState(lectura?.machine_id ?? (maquinas.length === 1 ? maquinas[0].machine_id : ""));
  const [fecha, setFecha] = useState(lectura?.fecha ?? hoyRD());
  const [horas, setHoras] = useState(lectura ? String(lectura.lectura) : "");
  const [nota, setNota] = useState(lectura?.nota ?? "");
  const [foto, setFoto] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const urlFoto = useFotoUrl(lectura?.foto_path);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const h = aNumero(horas);
    if (!machineId) return setError("Escoge la máquina.");
    if (!fecha) return setError("Falta la fecha.");
    if (fecha > hoyRD()) return setError("La fecha no puede ser de un día que todavía no llega.");
    if (h == null || h <= 0) return setError("Escribe las horas que marca el horómetro, por ejemplo 4523.7.");
    if (!foto && !lectura?.foto_path) return setError("Sube la foto del horómetro, donde se vean los números.");

    setGuardando(true);
    try {
      let fotoPath = lectura?.foto_path ?? "";
      if (foto) fotoPath = await subirFoto(foto, uid, `horometro-${fecha}`);

      const supabase = createClient();
      const datos = {
        machine_id: machineId,
        fecha,
        lectura: h,
        nota: nota.trim() || null,
        foto_path: fotoPath,
      };
      const { error: err } = nueva
        ? await supabase.from("lecturas_horometro").insert({ ...datos, creado_por: uid })
        : await supabase.from("lecturas_horometro").update(datos).eq("id", lectura.id);
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
    if (!lectura) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("lecturas_horometro").delete().eq("id", lectura.id);
    setGuardando(false);
    if (err) return setError(`No se pudo borrar: ${err.message}`);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nueva ? "Registrar horómetro" : "Lectura del horómetro"}</h2>
        {error && <div className="error">{error}</div>}

        {lectura?.estado === "Rechazado" && (
          <div className="alerta" style={{ marginBottom: 12 }}>
            El administrador la rechazó{lectura.motivo_rechazo ? `: ${lectura.motivo_rechazo}` : "."} Corrígela y vuelve a
            enviarla.
          </div>
        )}

        {aprobada ? (
          <>
            <div className="resumen">
              <div>{fmtFecha(lectura.fecha)}</div>
              <div>
                Aprobada: <b>{fmtNum(lectura.lectura, 1)} h</b>
              </div>
              {lectura.nota && <div>{lectura.nota}</div>}
            </div>
            {urlFoto && (
              <a href={urlFoto} target="_blank" rel="noreferrer">
                <img className="foto" src={urlFoto} alt="Horómetro" />
              </a>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="h-maq">Máquina</label>
              <select id="h-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
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
                <label htmlFor="h-fecha">Fecha</label>
                <input id="h-fecha" type="date" max={hoyRD()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="h-horas">Horas que marca</label>
                <input id="h-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
              </div>
            </div>
            <div className="hint" style={{ marginTop: -6, marginBottom: 10 }}>
              Anótalo al terminar el día, con el motor apagado. Escribe todos los números que marca el reloj, con el
              decimal.
            </div>

            <div className="field">
              <label htmlFor="h-foto">Foto del horómetro</label>
              {urlFoto && !foto && (
                <a href={urlFoto} target="_blank" rel="noreferrer">
                  <img className="foto" src={urlFoto} alt="Horómetro" />
                </a>
              )}
              <input id="h-foto" type="file" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files?.[0] ?? null)} />
              <div className="hint">Que se vean bien los números.</div>
            </div>

            <div className="field">
              <label htmlFor="h-nota">Nota (opcional)</label>
              <input id="h-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
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
            <button type="button" className={`btn danger${borrarListo ? " armed" : ""}`} onClick={borrar} disabled={guardando}>
              {borrarListo ? "Toca otra vez para borrar" : "Borrar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
