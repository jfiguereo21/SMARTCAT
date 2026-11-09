"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtNum } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { useFotoUrl } from "@/lib/fotos";
import type { AvisoLectura, LecturaHoro } from "@/lib/horometro";

// Pantalla del administrador para revisar una lectura de horómetro: foto, avisos, y aprobar o rechazar.
export default function HorometroEditor({
  lectura,
  maquina,
  operador,
  avisos,
  onClose,
  onSaved,
}: {
  lectura: LecturaHoro;
  maquina: string;
  operador: string;
  avisos: AvisoLectura[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const urlFoto = useFotoUrl(lectura.foto_path);
  const [horas, setHoras] = useState(String(lectura.lectura));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function decidir(estado: "Aprobado" | "Rechazado") {
    setError("");
    const h = aNumero(horas);
    if (h == null || h <= 0) return setError("Escribe las horas que marca el horómetro en la foto.");
    if (estado === "Rechazado" && motivo.trim() === "") return setError("Escribe por qué la rechazas, para que el operador lo sepa.");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("lecturas_horometro")
      .update({ lectura: h, estado, motivo_rechazo: estado === "Rechazado" ? motivo.trim() : null })
      .eq("id", lectura.id);
    setGuardando(false);
    if (err) return setError(err.message);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Revisar horómetro</h2>
        {error && <div className="error">{error}</div>}

        <div className="resumen">
          <div>
            <b>{maquina}</b>
          </div>
          <div>
            {fmtFecha(lectura.fecha)} · {operador}
          </div>
          <div>
            El operador escribió: <b>{fmtNum(lectura.lectura, 1)} h</b>
          </div>
          {lectura.nota && <div>{lectura.nota}</div>}
        </div>

        {avisos.map((a, i) => (
          <div key={i} className={a.alerta ? "alerta" : "line"} style={{ marginBottom: 10 }}>
            {a.texto}
          </div>
        ))}

        {urlFoto && (
          <a href={urlFoto} target="_blank" rel="noreferrer">
            <img className="foto" src={urlFoto} alt="Horómetro" />
          </a>
        )}

        <div className="field">
          <label htmlFor="he-horas">Horas que marca la foto</label>
          <input id="he-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
          <div className="hint">Si el operador se equivocó al escribirlo, corrígelo aquí antes de aprobar.</div>
        </div>

        <div className="field">
          <label htmlFor="he-motivo">Si la rechazas, ¿por qué?</label>
          <input id="he-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>

        <div className="actions">
          <button type="button" className="btn primary grow" disabled={guardando} onClick={() => decidir("Aprobado")}>
            {guardando ? "Guardando..." : "Aprobar"}
          </button>
          <button type="button" className="btn danger" disabled={guardando} onClick={() => decidir("Rechazado")}>
            Rechazar
          </button>
          <button type="button" className="btn" disabled={guardando} onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
