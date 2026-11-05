"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import FuelEditor from "@/components/FuelEditor";
import { aNumero, fmtNum, hoyRD, type Machine } from "@/lib/machines";
import { corteDe, fmtFecha } from "@/lib/conduces";
import {
  dieselUsd,
  resumenCombustible,
  type FuelLog,
  type PreciosCorte,
} from "@/lib/combustible";

type ConduceLigero = { machine_id: string; fecha: string; horas_cobrables: number };

export default function CombustiblePage() {
  const [cargas, setCargas] = useState<FuelLog[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [conduces, setConduces] = useState<ConduceLigero[]>([]);
  const [precios, setPrecios] = useState<PreciosCorte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtroCorte, setFiltroCorte] = useState<string | null>(null);
  // undefined = editor cerrado, null = carga nueva, FuelLog = editando
  const [editando, setEditando] = useState<FuelLog | null | undefined>(undefined);

  const [dieselTxt, setDieselTxt] = useState("");
  const [dolarTxt, setDolarTxt] = useState("");
  const [msgPrecios, setMsgPrecios] = useState("");
  const [guardandoPrecios, setGuardandoPrecios] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [f, m, c, p] = await Promise.all([
      supabase
        .from("fuel_logs")
        .select("*, machines(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables"),
      supabase.from("corte_precios").select("*").order("corte", { ascending: false }),
    ]);
    const fallo = f.error ?? m.error ?? c.error ?? p.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setCargas(
        ((f.data ?? []) as unknown as FuelLog[]).map((x) => ({ ...x, galones: Number(x.galones) }))
      );
      setMaquinas((m.data ?? []) as Machine[]);
      setConduces(
        ((c.data ?? []) as ConduceLigero[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) }))
      );
      setPrecios(
        ((p.data ?? []) as PreciosCorte[]).map((x) => ({
          corte: x.corte,
          precio_diesel_dop: Number(x.precio_diesel_dop),
          tasa_dolar: Number(x.tasa_dolar),
        }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cortes que existen en los datos (más el de hoy), el más reciente primero.
  const cortes = useMemo(() => {
    const mapa = new Map<string, string>();
    const sumar = (fecha: string) => {
      const k = corteDe(fecha);
      mapa.set(k.clave, k.etiqueta);
    };
    cargas.forEach((x) => sumar(x.fecha));
    conduces.forEach((x) => sumar(x.fecha));
    sumar(hoyRD());
    return [...mapa.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([clave, etiqueta]) => ({ clave, etiqueta }));
  }, [cargas, conduces]);

  const corteActivo = useMemo(() => {
    if (filtroCorte) return filtroCorte;
    const conDatos = cortes.find(
      (c) =>
        cargas.some((x) => corteDe(x.fecha).clave === c.clave) ||
        conduces.some((x) => corteDe(x.fecha).clave === c.clave)
    );
    return conDatos?.clave ?? cortes[0]?.clave ?? "";
  }, [filtroCorte, cortes, cargas, conduces]);

  const etiquetaCorte = cortes.find((c) => c.clave === corteActivo)?.etiqueta ?? "";

  const preciosCorte = precios.find((p) => p.corte === corteActivo) ?? null;
  // Si este corte no tiene precios, se sugiere lo del corte anterior más reciente.
  const sugerido = preciosCorte ?? precios.find((p) => p.corte < corteActivo) ?? null;

  useEffect(() => {
    setMsgPrecios("");
    setDieselTxt(sugerido ? String(sugerido.precio_diesel_dop) : "");
    setDolarTxt(sugerido ? String(sugerido.tasa_dolar) : "");
    // Se recalcula solo al cambiar de corte o al llegar los datos guardados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corteActivo, preciosCorte?.precio_diesel_dop, preciosCorte?.tasa_dolar, precios.length]);

  async function guardarPrecios() {
    setMsgPrecios("");
    const d = aNumero(dieselTxt);
    const t = aNumero(dolarTxt);
    if (d == null || d <= 0) return setMsgPrecios("Escribe el precio del galón en pesos, por ejemplo 246.80.");
    if (t == null || t <= 0) return setMsgPrecios("Escribe la tasa del dólar, por ejemplo 58.89.");
    setGuardandoPrecios(true);
    const { error: err } = await createClient()
      .from("corte_precios")
      .upsert({ corte: corteActivo, precio_diesel_dop: d, tasa_dolar: t });
    setGuardandoPrecios(false);
    if (err) return setMsgPrecios(`No se pudo guardar: ${err.message}`);
    setMsgPrecios("Guardado.");
    cargar();
  }

  const dNum = aNumero(dieselTxt);
  const tNum = aNumero(dolarTxt);
  const galonUsd = dNum && tNum && dNum > 0 && tNum > 0 ? dieselUsd(dNum, tNum) : null;
  const preciosGuardados =
    preciosCorte != null &&
    dNum === preciosCorte.precio_diesel_dop &&
    tNum === preciosCorte.tasa_dolar;

  const cargasDelCorte = cargas.filter((x) => corteDe(x.fecha).clave === corteActivo);
  const conducesDelCorte = conduces.filter((x) => corteDe(x.fecha).clave === corteActivo);

  const filas = useMemo(() => {
    return maquinas
      .map((m) => {
        const horas = conducesDelCorte
          .filter((c) => c.machine_id === m.id)
          .reduce((a, c) => a + c.horas_cobrables, 0);
        const galones = cargasDelCorte
          .filter((c) => c.machine_id === m.id)
          .reduce((a, c) => a + c.galones, 0);
        const r =
          galonUsd != null && m.tarifa != null && m.moneda === "USD"
            ? resumenCombustible(Math.round(horas * 100) / 100, galones, galonUsd, m.tarifa)
            : null;
        return { m, horas: Math.round(horas * 100) / 100, galones, r };
      })
      .filter((f) => f.horas > 0 || f.galones > 0);
  }, [maquinas, conducesDelCorte, cargasDelCorte, galonUsd]);

  const totalMonto = filas.reduce((a, f) => a + (f.r?.monto ?? 0), 0);
  const hayMonto = filas.some((f) => f.r != null);

  return (
    <main className="wrap">
      <Nav activa="combustible" />
      <div className="top">
        <h1>Combustible</h1>
        <button className="btn primary" onClick={() => setEditando(null)}>
          + Carga
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="cb-corte">Corte</label>
        <select id="cb-corte" value={corteActivo} onChange={(e) => setFiltroCorte(e.target.value)}>
          {cortes.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="resumen">
        <b>Precios del día 25</b>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="cb-diesel">Galón de diésel (RD$)</label>
            <input
              id="cb-diesel"
              inputMode="decimal"
              value={dieselTxt}
              onChange={(e) => setDieselTxt(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cb-dolar">Dólar (RD$)</label>
            <input
              id="cb-dolar"
              inputMode="decimal"
              value={dolarTxt}
              onChange={(e) => setDolarTxt(e.target.value)}
            />
          </div>
        </div>
        {galonUsd != null && (
          <div className="line" style={{ marginTop: 0 }}>
            El galón son <b>US${fmtNum(galonUsd, 4)}</b>
          </div>
        )}
        {preciosCorte == null && sugerido && (
          <div className="aviso">
            Estos números son del corte anterior. Pon el precio del día 25 y guarda.
          </div>
        )}
        {preciosCorte == null && !sugerido && (
          <div className="aviso">Falta el precio del diésel y el dólar de este corte.</div>
        )}
        <div className="actions">
          <button className="btn small primary" onClick={guardarPrecios} disabled={guardandoPrecios || preciosGuardados}>
            {guardandoPrecios ? "Guardando..." : preciosGuardados ? "Guardado" : "Guardar precios"}
          </button>
        </div>
        {msgPrecios && <div className="hint">{msgPrecios}</div>}
      </div>

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Cálculo del corte · {etiquetaCorte}</h2>
      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && filas.length === 0 && (
        <div className="empty">Este corte no tiene conduces ni cargas de combustible.</div>
      )}

      {filas.map(({ m, horas, galones, r }) => (
        <div className="card" key={m.id} style={{ cursor: "default" }}>
          <div className="row">
            <h2>{m.nombre}</h2>
            <div className="horas">
              {r ? fmtNum(r.monto, 2) : "—"}
              <small> US$</small>
            </div>
          </div>
          <div className="line">
            {fmtNum(horas, 2)} h · {fmtNum(galones, 2)} galones
            {r && ` · combustible US$${fmtNum(r.combustibleUsd, 2)}`}
          </div>
          {r && (
            <div className="line">
              Tarifa base US${fmtNum(m.tarifa ?? 0, 2)} − combustible US${fmtNum(r.porHora, 2)}/h ={" "}
              <b>US${fmtNum(r.tarifaNeta, 2)}/h</b>
            </div>
          )}
          {!r && horas === 0 && (
            <div className="aviso">Hay combustible pero ningún conduce de esta máquina en el corte.</div>
          )}
          {!r && horas > 0 && m.tarifa == null && <div className="aviso">La máquina no tiene tarifa definida.</div>}
          {!r && horas > 0 && m.tarifa != null && m.moneda !== "USD" && (
            <div className="aviso">Esta máquina cobra en pesos; el cálculo de combustible es solo en dólares.</div>
          )}
          {!r && horas > 0 && m.tarifa != null && m.moneda === "USD" && galonUsd == null && (
            <div className="aviso">Pon el precio del diésel y el dólar para calcular.</div>
          )}
        </div>
      ))}

      {hayMonto && (
        <div className="total" style={{ marginBottom: 16 }}>
          <div className="total-n">Total a facturar del corte (sin ITBIS)</div>
          <div className="total-h">US${fmtNum(totalMonto, 2)}</div>
        </div>
      )}

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Cargas del corte</h2>
      {!cargando && cargasDelCorte.length === 0 && (
        <div className="empty">No hay cargas en este corte. Toca “+ Carga”.</div>
      )}
      {cargasDelCorte.map((x) => (
        <button key={x.id} className="card" onClick={() => setEditando(x)}>
          <div className="row">
            <div>
              <h2>{x.machines?.nombre ?? "Máquina"}</h2>
              <div className="line">{[fmtFecha(x.fecha), x.nota].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="horas">
              {fmtNum(x.galones, 2)}
              <small> gal</small>
            </div>
          </div>
        </button>
      ))}

      {editando !== undefined && (
        <FuelEditor
          carga={editando}
          maquinas={maquinas}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined);
            cargar();
          }}
        />
      )}
    </main>
  );
}
