"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtMonto, hoyRD, type Acuerdo, type Machine, type Moneda } from "@/lib/machines";
import { fmtFecha, type Cliente } from "@/lib/conduces";

type Props = {
  acuerdo: Acuerdo | null; // null = acuerdo nuevo
  maquinas: Machine[];
  clientes: Cliente[];
  acuerdos: Acuerdo[]; // todos, para cerrar el anterior y evitar choques de fechas
  onClose: () => void;
  onSaved: () => void;
};

function diaAntes(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export default function AcuerdoEditor({ acuerdo, maquinas, clientes, acuerdos, onClose, onSaved }: Props) {
  const nuevo = acuerdo === null;
  const [machineId, setMachineId] = useState(acuerdo?.machine_id ?? "");
  const [clientId, setClientId] = useState(acuerdo?.client_id ?? "");
  const [obra, setObra] = useState(acuerdo?.obra ?? "");
  const [moneda, setMoneda] = useState<Moneda>(acuerdo?.moneda ?? "USD");
  const [tarifa, setTarifa] = useState(acuerdo ? String(acuerdo.tarifa) : "");
  const [inicio, setInicio] = useState(acuerdo?.fecha_inicio ?? hoyRD());
  const [fin, setFin] = useState(acuerdo?.fecha_fin ?? "");
  const [notas, setNotas] = useState(acuerdo?.notas ?? "");

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  function elegirMaquina(id: string) {
    setMachineId(id);
    const m = maquinas.find((x) => x.id === id);
    if (m?.obra && obra.trim() === "") setObra(m.obra);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!machineId) return setError("Escoge la máquina.");
    const t = aNumero(tarifa);
    if (t == null || t < 0) return setError("Escribe la tarifa por hora, por ejemplo 48 o 3000.");
    if (!inicio) return setError("Falta la fecha en que empieza el acuerdo.");
    if (fin && fin < inicio) return setError("La fecha de fin no puede ser antes de la de inicio.");

    // Otros acuerdos de la misma máquina que se cruzan con las fechas de este.
    const otros = acuerdos.filter(
      (a) =>
        a.machine_id === machineId &&
        a.id !== acuerdo?.id &&
        a.fecha_inicio <= (fin || "9999-12-31") &&
        (a.fecha_fin == null || a.fecha_fin >= inicio)
    );
    // Si lo único que se cruza es el acuerdo abierto anterior, se cierra el día antes de este.
    const abierto = otros.find((a) => a.fecha_fin == null) ?? null;
    const choques = otros.filter((a) => a !== abierto);
    if (choques.length > 0) {
      const c = choques[0];
      return setError(
        `Las fechas se cruzan con otro acuerdo de esta máquina (${fmtFecha(c.fecha_inicio)} a ${c.fecha_fin ? fmtFecha(c.fecha_fin) : "hoy"}).`
      );
    }
    if (abierto && abierto.fecha_inicio >= inicio)
      return setError(
        `Esta máquina ya tiene un acuerdo vigente desde el ${fmtFecha(abierto.fecha_inicio)}. Pon una fecha de inicio posterior, o cambia ese acuerdo.`
      );

    setGuardando(true);
    const supabase = createClient();

    let cerrado: Acuerdo | null = null;
    if (abierto) {
      const { error: errCierre } = await supabase
        .from("acuerdos")
        .update({ fecha_fin: diaAntes(inicio) })
        .eq("id", abierto.id);
      if (errCierre) {
        setGuardando(false);
        return setError(`No se pudo cerrar el acuerdo anterior: ${errCierre.message}`);
      }
      cerrado = abierto;
    }

    const datos = {
      machine_id: machineId,
      client_id: clientId || null,
      obra: obra.trim() || null,
      moneda,
      tarifa: t,
      fecha_inicio: inicio,
      fecha_fin: fin || null,
      notas: notas.trim() || null,
    };
    const { error: err } = nuevo
      ? await supabase.from("acuerdos").insert(datos)
      : await supabase.from("acuerdos").update(datos).eq("id", acuerdo.id);

    if (err) {
      // Si falló, se deja el acuerdo anterior como estaba.
      if (cerrado) await supabase.from("acuerdos").update({ fecha_fin: null }).eq("id", cerrado.id);
      setGuardando(false);
      return setError(`No se pudo guardar: ${err.message}`);
    }
    setGuardando(false);
    onSaved();
  }

  async function borrar() {
    if (!acuerdo) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("acuerdos").delete().eq("id", acuerdo.id);
    setGuardando(false);
    if (err) return setError(`No se pudo borrar: ${err.message}`);
    onSaved();
  }

  const previa = aNumero(tarifa);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nuevo ? "Acuerdo nuevo" : "Editar acuerdo"}</h2>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="a-maq">Máquina</label>
          <select
            id="a-maq"
            value={machineId}
            onChange={(e) => elegirMaquina(e.target.value)}
            disabled={!nuevo}
          >
            <option value="">Escoge la máquina</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="a-cli">Cliente</label>
          <select id="a-cli" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Sin cliente todavía</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="a-obra">Obra o lugar</label>
          <input id="a-obra" value={obra} onChange={(e) => setObra(e.target.value)} />
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="a-moneda">Moneda del acuerdo</label>
            <select id="a-moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              <option value="USD">Dólares (US$)</option>
              <option value="DOP">Pesos (RD$)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="a-tarifa">Tarifa por hora</label>
            <input
              id="a-tarifa"
              inputMode="decimal"
              value={tarifa}
              onChange={(e) => setTarifa(e.target.value)}
            />
          </div>
        </div>
        {previa != null && previa >= 0 && (
          <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
            Se factura a {fmtMonto(previa, moneda)} por hora.
          </div>
        )}

        <div className="grid2">
          <div className="field">
            <label htmlFor="a-ini">Empieza</label>
            <input id="a-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="a-fin">Termina (opcional)</label>
            <input id="a-fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
          Si lo dejas vacío, el acuerdo sigue vigente. Cuando crees uno nuevo para la misma máquina, el
          anterior se cierra solo el día antes.
        </div>

        <div className="field">
          <label htmlFor="a-notas">Notas del acuerdo</label>
          <textarea id="a-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </div>

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {!nuevo && (
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
