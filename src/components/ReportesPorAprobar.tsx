"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtNum } from "@/lib/machines";
import { diaSemana, fmtCorta, ETIQUETA_REPORTE, tratoVigente, type PerfilPago, type ReporteDiaRow, type TratoRow } from "@/lib/pagos";

const HORAS_REPARACION = 8;

function Fila({
  r,
  perfil,
  tratos,
  onChanged,
}: {
  r: ReporteDiaRow;
  perfil: PerfilPago | undefined;
  tratos: TratoRow[];
  onChanged: () => void;
}) {
  const trato = tratoVigente(perfil ?? {}, tratos, r.fecha);
  // Domingo: no se pagan horas de alojamiento; un festivo lo cambias tú al aprobar.
  const sugerida = r.tipo === "alojamiento" ? (diaSemana(r.fecha) === 0 ? 0 : trato.horas_alojamiento) : HORAS_REPARACION;
  const [horas, setHoras] = useState(String(sugerida));
  const [campo, setCampo] = useState(r.tipo === "reparacion" || trato.dieta_alojamiento);
  const [motivo, setMotivo] = useState("");
  const [rechazando, setRechazando] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function resolver(aprobar: boolean) {
    setError("");
    const h = aNumero(horas);
    if (aprobar && (h == null || h < 0)) return setError("Pon las horas que se le pagan ese día.");
    if (!aprobar && motivo.trim() === "") return setError("Escribe por qué lo rechazas.");
    setGuardando(true);
    const { data: u } = await createClient().auth.getUser();
    const { error: err } = await createClient()
      .from("reportes_dia")
      .update(
        aprobar
          ? { estado: "Aprobado", horas: h, fue_al_campo: campo, aprobado_por: u.user?.id ?? null, aprobado_en: new Date().toISOString() }
          : { estado: "Rechazado", motivo_rechazo: motivo.trim(), aprobado_por: u.user?.id ?? null, aprobado_en: new Date().toISOString() }
      )
      .eq("id", r.id);
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    onChanged();
  }

  return (
    <div className="card" style={{ cursor: "default" }}>
      <div className="row">
        <div>
          <h2>
            {perfil?.nombre || "Operador"} · {fmtCorta(r.fecha)}
          </h2>
          <div className="line">
            {ETIQUETA_REPORTE[r.tipo]}
            {r.nota ? ` · ${r.nota}` : ""}
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {!rechazando ? (
        <>
          <div className="grid2">
            <div className="field">
              <label>Horas que se le pagan</label>
              <input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
            </div>
            <label className="check" style={{ alignSelf: "end" }}>
              <input type="checkbox" checked={campo} onChange={(e) => setCampo(e.target.checked)} />
              Cobra dieta y combustible
            </label>
          </div>
          <div className="actions">
            <button className="btn small primary grow" disabled={guardando} onClick={() => resolver(true)}>
              Aprobar {fmtNum(aNumero(horas) ?? 0, 2)} h
            </button>
            <button className="btn small danger" disabled={guardando} onClick={() => setRechazando(true)}>
              Rechazar
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label>Motivo del rechazo</label>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <div className="actions">
            <button className="btn small danger grow" disabled={guardando} onClick={() => resolver(false)}>
              Rechazar
            </button>
            <button className="btn small" disabled={guardando} onClick={() => setRechazando(false)}>
              Volver
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Días que los operadores reportan sin conduce (alojamiento, reparando la máquina): el administrador aprueba y fija las horas.
export default function ReportesPorAprobar({
  reportes,
  perfiles,
  tratos,
  onChanged,
}: {
  reportes: ReporteDiaRow[];
  perfiles: PerfilPago[];
  tratos: TratoRow[];
  onChanged: () => void;
}) {
  const pendientes = reportes.filter((r) => r.estado === "Pendiente");
  if (pendientes.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="hint" style={{ marginTop: 0 }}>
        Días reportados sin conduce, por aprobar ({pendientes.length})
      </div>
      {pendientes.map((r) => (
        <Fila key={r.id} r={r} perfil={perfiles.find((p) => p.user_id === r.user_id)} tratos={tratos.filter((t) => t.user_id === r.user_id)} onChanged={onChanged} />
      ))}
    </div>
  );
}
