"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtFecha } from "@/lib/conduces";
import { ESTADOS_FALLA, borrarArchivosFalla, type EstadoFalla, type ReporteFalla } from "@/lib/fallas";
import { FotoFalla, VideoFalla } from "@/components/FallaMedia";

// Pantalla del administrador para tomar un reporte de falla: ver fotos y video, decidir a quién se manda y cerrar.
export default function FallaEditor({
  reporte,
  maquina,
  operador,
  onClose,
  onSaved,
}: {
  reporte: ReporteFalla;
  maquina: string;
  operador: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [estado, setEstado] = useState<EstadoFalla>(reporte.estado);
  const [asignado, setAsignado] = useState(reporte.asignado_a ?? "");
  const [nota, setNota] = useState(reporte.nota_admin ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  async function guardar() {
    setError("");
    if ((estado === "Enviado" || estado === "En reparación") && asignado.trim() === "") {
      return setError("Escribe a quién se lo mandaste (mecánico, taller, proveedor).");
    }
    setGuardando(true);
    const { error: err } = await createClient()
      .from("reportes_falla")
      .update({ estado, asignado_a: asignado.trim() || null, nota_admin: nota.trim() || null })
      .eq("id", reporte.id);
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    onSaved();
  }

  async function borrar() {
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("reportes_falla").delete().eq("id", reporte.id);
    if (err) {
      setGuardando(false);
      return setError(`No se pudo borrar: ${err.message}`);
    }
    await borrarArchivosFalla([...reporte.fotos, ...(reporte.video_path ? [reporte.video_path] : [])]);
    setGuardando(false);
    onSaved();
  }

  // Texto listo para mandar por WhatsApp al mecánico o al taller (las fotos y el video se reenvían aparte).
  const textoWhatsApp = [
    `Falla en ${maquina}`,
    reporte.urgencia === "Debe parar" ? "URGENTE: la máquina tiene que parar." : "La máquina puede seguir trabajando.",
    `Reportó: ${operador} (${fmtFecha(reporte.fecha)})`,
    reporte.descripcion,
  ].join("\n");

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>{maquina}</h2>
        {error && <div className="error">{error}</div>}

        <div className="resumen">
          <div>
            {fmtFecha(reporte.fecha)} · reportó {operador}
          </div>
          {reporte.urgencia === "Debe parar" && (
            <div>
              <span className="pill taller">Debe parar</span>
            </div>
          )}
          <div style={{ marginTop: 6 }}>{reporte.descripcion}</div>
        </div>

        {reporte.fotos.map((r) => (
          <FotoFalla key={r} path={r} />
        ))}
        {reporte.video_path && <VideoFalla path={reporte.video_path} />}
        {reporte.fotos.length === 0 && !reporte.video_path && <div className="hint">El operador no subió fotos ni video.</div>}

        <div className="field">
          <label htmlFor="fe-estado">Estado</label>
          <select id="fe-estado" value={estado} onChange={(e) => setEstado(e.target.value as EstadoFalla)}>
            {ESTADOS_FALLA.map((x) => (
              <option key={x} value={x}>
                {x === "Nuevo" ? "Nuevo (sin tomar)" : x}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="fe-asig">¿A quién se lo mandaste?</label>
          <input id="fe-asig" value={asignado} onChange={(e) => setAsignado(e.target.value)} />
          <div className="hint">Por ejemplo: el mecánico Juan, el taller de Higüey, el proveedor.</div>
        </div>
        <div className="field">
          <label htmlFor="fe-nota">Nota (solo la ves tú)</label>
          <textarea id="fe-nota" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>

        <div className="actions">
          <button type="button" className="btn primary grow" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
        </div>
        <div className="actions">
          <a
            className="btn small"
            href={`https://wa.me/?text=${encodeURIComponent(textoWhatsApp)}`}
            target="_blank"
            rel="noreferrer"
          >
            Mandar el texto por WhatsApp
          </a>
          <button type="button" className={`btn small danger${borrarListo ? " armed" : ""}`} onClick={borrar} disabled={guardando}>
            {borrarListo ? "Toca otra vez para borrar" : "Borrar reporte"}
          </button>
        </div>
      </div>
    </div>
  );
}
