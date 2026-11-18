"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtMonto, hoyRD } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { estadoTraspaso, type Traspaso } from "@/lib/fondo";
import type { Socio } from "@/components/FondoEditor";

// Pasar dinero de un fondo a otro: a uno se le resta y al otro se le suma. El dinero total del Fondo no cambia.
// Lo aprueba el otro socio (quien no lo registró).
export default function TraspasoEditor({
  traspaso,
  socios,
  uid,
  onClose,
  onSaved,
}: {
  traspaso: Traspaso | null; // null = traspaso nuevo
  socios: Socio[];
  uid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const nuevo = traspaso === null;
  const nombreDe = (id: string | null) => socios.find((s) => s.user_id === id)?.nombre || "otro socio";
  const otro = socios.find((s) => s.user_id !== uid)?.user_id ?? "";

  const [fecha, setFecha] = useState(traspaso?.fecha ?? hoyRD());
  const [monto, setMonto] = useState(traspaso ? String(traspaso.monto) : "");
  const [de, setDe] = useState(traspaso?.de_socio_id ?? otro);
  const [a, setA] = useState(traspaso?.a_socio_id ?? uid);
  const [nota, setNota] = useState(traspaso?.nota ?? "");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const estado = traspaso ? estadoTraspaso(traspaso) : null;
  const soyCreador = traspaso ? traspaso.creado_por === uid : true;
  const mNum = aNumero(monto);
  const puedeAprobar = traspaso != null && estado === "Por aprobar" && !soyCreador;
  const puedeEditar = nuevo || (soyCreador && estado !== "Aprobado");
  const puedeBorrar = traspaso != null && soyCreador && estado !== "Aprobado";

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha) return setError("Falta la fecha.");
    if (mNum == null || mNum <= 0) return setError("Escribe el monto, por ejemplo 50000.");
    if (!de || !a) return setError("Escoge de qué fondo sale y a cuál entra.");
    if (de === a) return setError("El dinero tiene que pasar de un fondo a otro distinto.");
    setGuardando(true);
    const supabase = createClient();
    const datos = { fecha, monto: mNum, de_socio_id: de, a_socio_id: a, nota: nota.trim() || null };
    const { error: err } = nuevo
      ? await supabase.from("fondo_traspasos").insert(datos)
      : await supabase.from("fondo_traspasos").update(datos).eq("id", traspaso.id);
    if (err) {
      setGuardando(false);
      return setError(`No se pudo guardar: ${err.message}`);
    }
    onSaved();
  }

  async function accion(que: "aprobar" | "rechazar") {
    if (!traspaso) return;
    setError("");
    if (que === "rechazar" && motivo.trim() === "") return setError("Escribe por qué lo rechazas.");
    setGuardando(true);
    const ahora = new Date().toISOString();
    const cambios = que === "aprobar" ? { aprobado_en: ahora } : { rechazado_en: ahora, motivo_rechazo: motivo.trim() };
    const { error: err } = await createClient().from("fondo_traspasos").update(cambios).eq("id", traspaso.id);
    if (err) {
      setGuardando(false);
      return setError(err.message);
    }
    onSaved();
  }

  async function borrar() {
    if (!traspaso) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("fondo_traspasos").delete().eq("id", traspaso.id);
    if (err) {
      setGuardando(false);
      return setError(`No se pudo borrar: ${err.message}`);
    }
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nuevo ? "Pasar dinero entre fondos" : `Traspaso · ${estado}`}</h2>
        {nuevo && (
          <div className="hint" style={{ marginBottom: 12 }}>
            Al fondo que da se le resta y al que recibe se le suma. El dinero del banco no cambia. Lo aprueba el otro
            socio.
          </div>
        )}
        {error && <div className="error">{error}</div>}

        {traspaso && (
          <div className="resumen">
            Registrado por <b>{nombreDe(traspaso.creado_por)}</b> el {fmtFecha(traspaso.created_at.slice(0, 10))}.
            {traspaso.aprobado_en && (
              <>
                {" "}
                Aprobado por <b>{nombreDe(traspaso.aprobado_por)}</b>.
              </>
            )}
            {traspaso.rechazado_en && (
              <div className="aviso">
                Rechazado por {nombreDe(traspaso.rechazado_por)}
                {traspaso.motivo_rechazo ? `: ${traspaso.motivo_rechazo}` : ""}. Si lo corriges, vuelve a quedar por
                aprobar.
              </div>
            )}
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label htmlFor="tr-de">Sale del fondo de</label>
            <select id="tr-de" value={de} onChange={(e) => setDe(e.target.value)} disabled={!puedeEditar}>
              <option value="">Escoge</option>
              {socios.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tr-a">Entra al fondo de</label>
            <select id="tr-a" value={a} onChange={(e) => setA(e.target.value)} disabled={!puedeEditar}>
              <option value="">Escoge</option>
              {socios.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="tr-monto">Monto (RD$)</label>
            <input id="tr-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} disabled={!puedeEditar} />
          </div>
          <div className="field">
            <label htmlFor="tr-fecha">Fecha</label>
            <input id="tr-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!puedeEditar} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tr-nota">Nota</label>
          <input id="tr-nota" value={nota} onChange={(e) => setNota(e.target.value)} disabled={!puedeEditar} />
          <div className="hint">Por ejemplo: para pagar el repuesto de la CAT.</div>
        </div>

        {puedeAprobar && (
          <div className="field">
            <label htmlFor="tr-motivo">Si lo rechazas, ¿por qué?</label>
            <input id="tr-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        )}

        <div className="actions">
          {puedeAprobar && (
            <>
              <button type="button" className="btn primary grow" disabled={guardando} onClick={() => accion("aprobar")}>
                Aprobar
              </button>
              <button type="button" className="btn danger" disabled={guardando} onClick={() => accion("rechazar")}>
                Rechazar
              </button>
            </>
          )}
          {puedeEditar && (
            <button type="submit" className={nuevo ? "btn primary grow" : "btn"} disabled={guardando}>
              {guardando ? "Guardando..." : nuevo ? "Guardar" : "Guardar cambios"}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {puedeBorrar && (
            <button type="button" className={`btn danger${borrarListo ? " armed" : ""}`} onClick={borrar} disabled={guardando}>
              {borrarListo ? "Toca otra vez para borrar" : "Borrar"}
            </button>
          )}
        </div>
        {traspaso && puedeAprobar && (
          <div className="hint">Monto: {fmtMonto(traspaso.monto, "DOP")}. Si hay algo mal, recházalo con el motivo.</div>
        )}
      </form>
    </div>
  );
}
