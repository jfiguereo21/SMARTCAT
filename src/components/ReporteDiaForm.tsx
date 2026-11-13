"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hoyRD } from "@/lib/machines";
import { ETIQUETA_REPORTE, type TipoReporteDia } from "@/lib/pagos";

// El operador reporta un día en que no hay conduce: estuvo en el alojamiento o trabajó reparando la máquina.
// El administrador lo aprueba y fija las horas.
export default function ReporteDiaForm({
  uid,
  onClose,
  onSaved,
}: {
  uid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fecha, setFecha] = useState(hoyRD());
  const [tipo, setTipo] = useState<TipoReporteDia | "">("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!tipo) return setError("Escoge qué pasó ese día.");
    if (!fecha || fecha > hoyRD()) return setError("La fecha no puede ser de un día que no ha llegado.");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("reportes_dia")
      .insert({ user_id: uid, fecha, tipo, nota: nota.trim() || null });
    setGuardando(false);
    if (err) {
      return setError(
        err.code === "23505"
          ? "Ya reportaste ese día. Si te equivocaste, quítalo de la lista y reporta de nuevo."
          : `No se pudo enviar: ${err.message}`
      );
    }
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={enviar}>
        <h2>Día sin conduce</h2>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="rd-fecha">Día</label>
          <input id="rd-fecha" type="date" max={hoyRD()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>

        <div className="field">
          {(["alojamiento", "reparacion"] as TipoReporteDia[]).map((t) => (
            <button
              key={t}
              type="button"
              className={tipo === t ? "btn primary" : "btn"}
              style={{ width: "100%", minHeight: 56, fontSize: 17, marginBottom: 8 }}
              onClick={() => setTipo(t)}
            >
              {ETIQUETA_REPORTE[t]}
            </button>
          ))}
        </div>

        <div className="field">
          <label htmlFor="rd-nota">Nota (opcional)</label>
          <input id="rd-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>

        <div className="hint">El administrador lo revisa y aprueba, y él fija las horas.</div>

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Enviando..." : "Enviar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
