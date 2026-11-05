"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import FuelEditor from "@/components/FuelEditor";
import {
  acuerdoVigente,
  aNumero,
  fmtMonto,
  fmtNum,
  hoyRD,
  type Acuerdo,
  type Machine,
  type Moneda,
} from "@/lib/machines";
import { corteDe, fmtFecha } from "@/lib/conduces";
import {
  descuentoCliente,
  evaluarConsumo,
  redondear2,
  sumarCargas,
  type CorteConsumo,
  type Evaluacion,
  type FuelLog,
  type PreciosCorte,
} from "@/lib/combustible";

type ConduceLigero = { machine_id: string; fecha: string; horas_cobrables: number };

function textoGasto(t: { DOP: number; USD: number }): string {
  const partes: string[] = [];
  if (t.DOP > 0) partes.push(fmtMonto(t.DOP, "DOP"));
  if (t.USD > 0) partes.push(fmtMonto(t.USD, "USD"));
  return partes.length > 0 ? partes.join(" + ") : "RD$0.00";
}

function mensajeConsumo(ev: Evaluacion, horas: number): { texto: string; alerta: boolean } | null {
  const pct = ev.desviacion != null ? `${ev.desviacion > 0 ? "+" : ""}${Math.round(ev.desviacion * 100)}%` : "";
  const contra = ev.fuente === "normal" ? "el consumo normal que pusiste" : "el promedio de sus cortes anteriores";
  switch (ev.nivel) {
    case "alto":
      return {
        alerta: true,
        texto: `Gasta mucho más de lo normal: ${fmtNum(ev.gph ?? 0, 2)} gal/h contra ${fmtNum(ev.referencia ?? 0, 2)} (${pct}, según ${contra}). Revisa si hay fuga, robo, un trabajo más pesado u horas mal anotadas.`,
      };
    case "bajo":
      return {
        alerta: true,
        texto: `Gasta mucho menos de lo normal: ${fmtNum(ev.gph ?? 0, 2)} gal/h contra ${fmtNum(ev.referencia ?? 0, 2)} (${pct}, según ${contra}). Puede que falten cargas por anotar o que haya más horas de las anotadas.`,
      };
    case "sin_horas":
      return { alerta: true, texto: "Hay combustible anotado pero ningún conduce de esta máquina en el corte." };
    case "sin_combustible":
      return {
        alerta: true,
        texto: `Tiene ${fmtNum(horas, 2)} h trabajadas y ninguna carga de combustible anotada.`,
      };
    case "ok":
      return {
        alerta: false,
        texto: `Consumo normal: ${fmtNum(ev.gph ?? 0, 2)} gal/h contra ${fmtNum(ev.referencia ?? 0, 2)} (${pct}).`,
      };
    case "pocas_horas":
      return { alerta: false, texto: "Muy pocas horas en el corte para comparar el consumo." };
    case "sin_referencia":
      return {
        alerta: false,
        texto:
          "Todavía no hay con qué comparar. Pon el consumo normal de la máquina en Máquinas, o espera al próximo corte.",
      };
    default:
      return null;
  }
}

export default function CombustiblePage() {
  const [cargas, setCargas] = useState<FuelLog[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [conduces, setConduces] = useState<ConduceLigero[]>([]);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
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
    const [f, m, c, a, p] = await Promise.all([
      supabase
        .from("fuel_logs")
        .select("*, machines(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables")
        .eq("estado", "Aprobado"),
      supabase.from("acuerdos").select("*"),
      supabase.from("corte_precios").select("*").order("corte", { ascending: false }),
    ]);
    const fallo = f.error ?? m.error ?? c.error ?? a.error ?? p.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setCargas(
        ((f.data ?? []) as unknown as FuelLog[]).map((x) => ({
          ...x,
          galones: Number(x.galones),
          precio_galon: x.precio_galon == null ? null : Number(x.precio_galon),
          monto: x.monto == null ? null : Number(x.monto),
        }))
      );
      setMaquinas(
        ((m.data ?? []) as Machine[]).map((x) => ({
          ...x,
          consumo_esperado: x.consumo_esperado == null ? null : Number(x.consumo_esperado),
        }))
      );
      setConduces(
        ((c.data ?? []) as ConduceLigero[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) }))
      );
      setAcuerdos(((a.data ?? []) as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
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

  // Al abrir: el corte más reciente que tiene cargas; si no hay ninguna, el de hoy.
  const corteActivo = filtroCorte ?? (cargas[0] ? corteDe(cargas[0].fecha).clave : corteDe(hoyRD()).clave);
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
  const preciosGuardados =
    preciosCorte != null && dNum === preciosCorte.precio_diesel_dop && tNum === preciosCorte.tasa_dolar;

  const cargasDelCorte = cargas.filter((x) => corteDe(x.fecha).clave === corteActivo);
  const totalCorte = sumarCargas(cargasDelCorte);

  // Un resumen por máquina en el corte activo.
  const filas = useMemo(() => {
    // Galones y horas por máquina y por corte, para comparar contra los cortes anteriores.
    const acumulado = new Map<string, CorteConsumo>();
    const toca = (machineId: string, corte: string) => {
      const k = `${machineId}|${corte}`;
      const v = acumulado.get(k) ?? { galones: 0, horas: 0 };
      acumulado.set(k, v);
      return v;
    };
    cargas.forEach((c) => (toca(c.machine_id, corteDe(c.fecha).clave).galones += c.galones));
    conduces.forEach((c) => (toca(c.machine_id, corteDe(c.fecha).clave).horas += c.horas_cobrables));
    const anteriores = cortes.map((c) => c.clave).filter((k) => k < corteActivo).slice(0, 3);

    return maquinas
      .map((m) => {
        const susCargas = cargasDelCorte.filter((c) => c.machine_id === m.id);
        const susConduces = conduces.filter((c) => c.machine_id === m.id && corteDe(c.fecha).clave === corteActivo);
        const horas = redondear2(susConduces.reduce((a, c) => a + c.horas_cobrables, 0));
        const t = sumarCargas(susCargas);

        const ev = evaluarConsumo(
          t.galones,
          horas,
          m.consumo_esperado,
          anteriores.map((k) => acumulado.get(`${m.id}|${k}`) ?? { galones: 0, horas: 0 })
        );

        // Bruto = horas × tarifa del acuerdo que regía cada día, por moneda.
        const bruto = new Map<Moneda, number>();
        let horasSinAcuerdo = 0;
        for (const c of susConduces) {
          const a = acuerdoVigente(acuerdos, m.id, c.fecha);
          if (!a) horasSinAcuerdo += c.horas_cobrables;
          else bruto.set(a.moneda, (bruto.get(a.moneda) ?? 0) + c.horas_cobrables * a.tarifa);
        }
        const monedas = [...bruto.keys()];
        const moneda: Moneda | null = monedas.length === 1 ? monedas[0] : null;
        const brutoNum = moneda ? redondear2(bruto.get(moneda) ?? 0) : null;
        const descuento =
          moneda && t.galonesCliente > 0 && preciosCorte
            ? descuentoCliente(t.galonesCliente, preciosCorte.precio_diesel_dop, preciosCorte.tasa_dolar, moneda)
            : null;

        return {
          m,
          horas,
          t,
          cuantas: susCargas.length,
          ev,
          moneda,
          mezcla: monedas.length > 1,
          brutoNum,
          descuento,
          horasSinAcuerdo: redondear2(horasSinAcuerdo),
        };
      })
      .filter((f) => f.cuantas > 0 || f.horas > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maquinas, cargas, conduces, acuerdos, cortes, corteActivo, preciosCorte]);

  const alertas = filas
    .map((f) => ({ f, msg: mensajeConsumo(f.ev, f.horas) }))
    .filter((x) => x.msg?.alerta);

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

      {alertas.map(({ f, msg }) => (
        <div className="alerta" key={f.m.id} style={{ marginBottom: 8 }}>
          <b>{f.m.nombre}:</b> {msg?.texto}
        </div>
      ))}

      <div className="resumen">
        <b>Precio del día 25 (para el combustible que da el cliente)</b>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="cb-diesel">Galón de diésel (RD$)</label>
            <input id="cb-diesel" inputMode="decimal" value={dieselTxt} onChange={(e) => setDieselTxt(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cb-dolar">Dólar (RD$)</label>
            <input id="cb-dolar" inputMode="decimal" value={dolarTxt} onChange={(e) => setDolarTxt(e.target.value)} />
          </div>
        </div>
        {dNum && tNum && dNum > 0 && tNum > 0 && (
          <div className="line" style={{ marginTop: 0 }}>
            El galón son <b>US${fmtNum(dNum / tNum, 4)}</b>
          </div>
        )}
        {preciosCorte == null && sugerido && (
          <div className="aviso">Estos números son del corte anterior. Pon los del día 25 y guarda.</div>
        )}
        {preciosCorte == null && !sugerido && (
          <div className="aviso">Falta el precio del diésel y el dólar de este corte.</div>
        )}
        <div className="actions">
          <button
            className="btn small primary"
            onClick={guardarPrecios}
            disabled={guardandoPrecios || preciosGuardados}
          >
            {guardandoPrecios ? "Guardando..." : preciosGuardados ? "Guardado" : "Guardar precios"}
          </button>
        </div>
        {msgPrecios && <div className="hint">{msgPrecios}</div>}
      </div>

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Por máquina · {etiquetaCorte}</h2>
      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && filas.length === 0 && (
        <div className="empty">Este corte no tiene conduces ni cargas de combustible.</div>
      )}

      {filas.map(({ m, horas, t, ev, moneda, mezcla, brutoNum, descuento, horasSinAcuerdo }) => {
        const msg = mensajeConsumo(ev, horas);
        return (
          <div className="card" key={m.id} style={{ cursor: "default" }}>
            <div className="row">
              <h2>{m.nombre}</h2>
              <div className="horas">
                {ev.gph != null ? fmtNum(ev.gph, 2) : "—"}
                <small> gal/h</small>
              </div>
            </div>
            <div className="line">
              {fmtNum(horas, 2)} h · {fmtNum(t.galones, 2)} galones
              {t.galonesCliente > 0 && ` (${fmtNum(t.galonesCliente, 2)} del cliente)`}
              {t.galonesPropios > 0 && ` (${fmtNum(t.galonesPropios, 2)} míos)`}
            </div>
            {msg && (
              <div className={msg.alerta ? "alerta" : "line"} style={{ marginTop: 6 }}>
                {msg.texto}
              </div>
            )}

            {t.galonesPropios > 0 && (
              <div className="line">
                Gasto mío en combustible: <b>{textoGasto(t)}</b>
              </div>
            )}

            {t.galonesCliente > 0 && (
              <div className="line">
                {descuento != null && moneda && brutoNum != null ? (
                  <>
                    Facturado {fmtMonto(brutoNum, moneda)} − combustible del cliente{" "}
                    {fmtMonto(descuento, moneda)} ={" "}
                    <b>{fmtMonto(redondear2(brutoNum - descuento), moneda)}</b>
                  </>
                ) : mezcla ? (
                  "Hay horas con acuerdos en monedas distintas: revisa los acuerdos para calcular el descuento."
                ) : preciosCorte == null ? (
                  "Pon el precio del día 25 para calcular el descuento del combustible del cliente."
                ) : (
                  "No hay acuerdo de tarifa para estas horas: revisa la pestaña Acuerdos."
                )}
              </div>
            )}
            {horasSinAcuerdo > 0 && (
              <div className="aviso">
                {fmtNum(horasSinAcuerdo, 2)} h sin acuerdo de tarifa vigente en esa fecha.
              </div>
            )}
          </div>
        );
      })}

      <h2 style={{ fontSize: 18, margin: "16px 0 8px" }}>Cargas del corte</h2>
      {cargasDelCorte.length > 0 && (
        <div className="hint" style={{ marginBottom: 8 }}>
          {fmtNum(totalCorte.galones, 2)} galones en total
          {totalCorte.galonesCliente > 0 && ` · ${fmtNum(totalCorte.galonesCliente, 2)} del cliente`}
          {totalCorte.galonesPropios > 0 && ` · ${fmtNum(totalCorte.galonesPropios, 2)} míos, ${textoGasto(totalCorte)}`}
        </div>
      )}
      {!cargando && !error && cargasDelCorte.length === 0 && (
        <div className="empty">No hay cargas en este corte. Toca “+ Carga”.</div>
      )}
      {cargasDelCorte.map((x) => (
        <button key={x.id} className="card" onClick={() => setEditando(x)}>
          <div className="row">
            <div>
              <h2>{x.machines?.nombre ?? "Máquina"}</h2>
              <span className={x.origen === "Cliente" ? "pill obra" : "pill taller"}>
                {x.origen === "Cliente" ? "Lo dio el cliente" : "Gasto mío"}
              </span>
              <div className="line">{[fmtFecha(x.fecha), x.nota].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="horas" style={{ fontSize: 22 }}>
              {fmtNum(x.galones, 2)}
              <small> gal</small>
            </div>
          </div>
          {x.monto != null && x.precio_galon != null && (
            <div className="line">
              {fmtNum(x.galones, 2)} gal × {fmtMonto(x.precio_galon, x.moneda)} = {fmtMonto(x.monto, x.moneda)}
            </div>
          )}
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
