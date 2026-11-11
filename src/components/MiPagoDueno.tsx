"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtMonto, fmtNum, hoyRD } from "@/lib/machines";
import { corteDe, fmtFecha } from "@/lib/conduces";

export type PagoDuenoVista = {
  maquina: string;
  pago_hora: number;
  descuenta: boolean;
  horas: number;
  bruto: number;
  galones_cliente: number;
  galones_propios: number;
  precio_galon: number | null;
  descuento: number | null;
  neto: number | null;
  dias: { fecha: string; horas: number }[];
  cargas: { fecha: string; galones: number; origen: string }[];
};

const dinero = (n: number) => fmtMonto(n, "DOP");

// El corte anterior: el día 25 del mes anterior.
function corteAnterior(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 25)).toISOString().slice(0, 10);
}

// Lo que ve el dueño que también opera su máquina: horas del corte, pago por hora,
// combustible descontado y lo que le toca. No muestra la tarifa del cliente.
export default function MiPagoDueno({ onEsDueno }: { onEsDueno: (esDueno: boolean) => void }) {
  const actual = corteDe(hoyRD());
  const [clave, setClave] = useState(actual.clave);
  const [datos, setDatos] = useState<PagoDuenoVista[] | null>(null);
  const [error, setError] = useState("");
  const [verDias, setVerDias] = useState(false);

  useEffect(() => {
    let vivo = true;
    createClient()
      .rpc("mi_pago_dueno", { p_corte: clave })
      .then(({ data, error: err }) => {
        if (!vivo) return;
        if (err) {
          onEsDueno(false); // que los demás operadores sigan viendo su pago normal
          return setError(`No se pudo cargar el pago de la máquina: ${err.message}`);
        }
        const lista = (data ?? []) as PagoDuenoVista[];
        setError("");
        setDatos(lista);
        onEsDueno(lista.length > 0);
      });
    return () => {
      vivo = false;
    };
  }, [clave, onEsDueno]);

  if (error) return <div className="error">{error}</div>;
  if (!datos || datos.length === 0) return null;

  // Mientras el corte no ha cerrado, el precio del combustible y las horas todavía pueden cambiar.
  const abierto = clave >= hoyRD();

  return (
    <div className="resumen" style={{ marginBottom: 16 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Pago de tu máquina</h2>
      <div className="field">
        <select aria-label="Corte" value={clave} onChange={(e) => setClave(e.target.value)}>
          <option value={actual.clave}>{actual.etiqueta} (este corte)</option>
          <option value={corteAnterior(actual.clave)}>{corteDe(corteAnterior(actual.clave)).etiqueta}</option>
        </select>
      </div>
      {datos.map((d) => (
        <div key={d.maquina} style={{ marginBottom: 10 }}>
          <b>{d.maquina}</b>
          <div className="line">
            {fmtNum(d.horas, 2)} h × {dinero(d.pago_hora)} = <b>{dinero(d.bruto)}</b>
          </div>
          {d.descuenta && d.galones_cliente > 0 && (
            <div className="line">
              Combustible echado: {fmtNum(d.galones_cliente, 2)} gal
              {d.precio_galon != null ? ` × ${dinero(d.precio_galon)}` : ""}
              {d.descuento != null ? ` = −${dinero(d.descuento)}` : " (falta el precio del combustible)"}
            </div>
          )}
          {d.descuenta && d.galones_propios > 0 && (
            <div className="line">Combustible comprado por la empresa: {fmtNum(d.galones_propios, 2)} gal</div>
          )}
          {d.neto != null ? (
            <div className="total-h" style={{ fontSize: 22 }}>
              {abierto ? "Llevas a la fecha" : "Te toca"}: {dinero(d.neto)}
            </div>
          ) : (
            <div className="aviso">Todavía no se puede calcular: falta el precio del combustible de este corte.</div>
          )}
          <div className="hint">
            {abierto
              ? "El corte sigue abierto: el monto sube cuando se aprueban más horas, y el precio del combustible se confirma el día 25."
              : "Corte cerrado."}{" "}
            Solo cuentan las horas y cargas ya aprobadas.
          </div>
          <button type="button" className="btn small" onClick={() => setVerDias((v) => !v)}>
            {verDias ? "Ocultar detalle" : "Ver detalle por día"}
          </button>
          {verDias && (
            <div style={{ marginTop: 8 }}>
              {d.dias.map((x) => (
                <div className="line" key={x.fecha}>
                  {fmtFecha(x.fecha)}: {fmtNum(x.horas, 2)} h
                </div>
              ))}
              {d.cargas.map((x, i) => (
                <div className="line" key={`${x.fecha}-${i}`}>
                  {fmtFecha(x.fecha)}: {fmtNum(x.galones, 2)} gal de combustible
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
