"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { aNumero, fmtMonto, fmtNum, hoyRD, type Acuerdo } from "@/lib/machines";
import { corteDe, fmtFecha } from "@/lib/conduces";
import type { PreciosCorte } from "@/lib/combustible";
import { avanceCorte, facturadoDeCorte, type Avance, type ConduceMeta } from "@/lib/metas";
import { fmtCorta, nombreDia } from "@/lib/pagos";

type Meta = { corte: string; monto: number };
const rd = (n: number) => fmtMonto(n, "DOP");

function Grafica({ av }: { av: Avance }) {
  const W = 600;
  const H = 200;
  const P = 28;
  const n = av.dias.length;
  if (n < 2) return null;
  const hoy = hoyRD();
  const tope = Math.max(av.meta ?? 0, ...av.dias.map((d) => d.acumulado), 1);
  const x = (i: number) => P + (i * (W - P * 2)) / (n - 1);
  const y = (v: number) => H - P - (v * (H - P * 2)) / tope;
  const real = av.dias.filter((d) => d.fecha <= hoy);
  const trazo = (pts: { i: number; v: number }[]) => pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i)},${y(p.v)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Avance del corte contra la meta" style={{ width: "100%", height: "auto" }}>
      <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--line)" />
      <line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--line)" />
      {av.meta != null && (
        <>
          <path d={trazo(av.dias.map((d, i) => ({ i, v: d.esperado })))} fill="none" stroke="var(--muted)" strokeWidth={2} strokeDasharray="6 5" />
          <text x={W - P} y={y(av.meta) - 6} textAnchor="end" fontSize={11} fill="var(--muted)">
            meta {rd(av.meta)}
          </text>
        </>
      )}
      <path d={trazo(real.map((d) => ({ i: av.dias.indexOf(d), v: d.acumulado })))} fill="none" stroke="var(--brand)" strokeWidth={3} />
      <text x={P} y={H - 8} fontSize={11} fill="var(--muted)">
        {fmtCorta(av.dias[0].fecha)}
      </text>
      <text x={W - P} y={H - 8} textAnchor="end" fontSize={11} fill="var(--muted)">
        {fmtCorta(av.dias[n - 1].fecha)}
      </text>
    </svg>
  );
}

export default function MetasPage() {
  const [conduces, setConduces] = useState<ConduceMeta[]>([]);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [precios, setPrecios] = useState<PreciosCorte[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [claveSel, setClaveSel] = useState<string | null>(null);
  const [metaTxt, setMetaTxt] = useState("");
  const [msg, setMsg] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [verDias, setVerDias] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [c, a, p, m] = await Promise.all([
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables, estado").neq("estado", "Rechazado"),
      supabase.from("acuerdos").select("*"),
      supabase.from("corte_precios").select("*"),
      supabase.from("metas").select("corte, monto"),
    ]);
    const fallo = c.error ?? a.error ?? p.error ?? m.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setConduces(((c.data ?? []) as ConduceMeta[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) })));
      setAcuerdos(((a.data ?? []) as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
      setPrecios(
        ((p.data ?? []) as PreciosCorte[]).map((x) => ({
          corte: x.corte,
          precio_diesel_dop: Number(x.precio_diesel_dop),
          tasa_dolar: Number(x.tasa_dolar),
        }))
      );
      setMetas(((m.data ?? []) as Meta[]).map((x) => ({ corte: x.corte, monto: Number(x.monto) })));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hoy = hoyRD();
  const cortes = useMemo(() => {
    const mapa = new Map<string, string>();
    const sumar = (fecha: string) => {
      const k = corteDe(fecha);
      mapa.set(k.clave, k.etiqueta);
    };
    conduces.forEach((x) => sumar(x.fecha));
    metas.forEach((x) => sumar(x.corte));
    sumar(hoy);
    return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([clave, etiqueta]) => ({ clave, etiqueta }));
  }, [conduces, metas, hoy]);

  const clave = claveSel ?? corteDe(hoy).clave;
  const meta = metas.find((m) => m.corte === clave)?.monto ?? null;
  const av = useMemo(
    () => avanceCorte(clave, hoy, conduces, acuerdos, precios, meta),
    [clave, hoy, conduces, acuerdos, precios, meta]
  );
  const anterior = useMemo(() => {
    const prev = cortes.find((c) => c.clave < clave);
    if (!prev) return null;
    return { clave: prev.clave, meta: metas.find((m) => m.corte === prev.clave)?.monto ?? null };
  }, [cortes, clave, metas]);

  useEffect(() => {
    setMetaTxt(meta != null ? String(meta) : "");
    setMsg("");
  }, [clave, meta]);

  async function guardarMeta() {
    setMsg("");
    const n = aNumero(metaTxt);
    if (n == null || n <= 0) return setMsg("Escribe la meta en pesos, por ejemplo 1500000.");
    setGuardando(true);
    const { error: err } = await createClient().from("metas").upsert({ corte: clave, monto: n });
    setGuardando(false);
    if (err) return setMsg(`No se pudo guardar: ${err.message}`);
    cargar();
  }

  const historial = useMemo(
    () =>
      cortes
        .filter((c) => c.clave < corteDe(hoy).clave || metas.some((m) => m.corte === c.clave))
        .slice(0, 12)
        .map((c) => {
          const m = metas.find((x) => x.corte === c.clave)?.monto ?? null;
          const f = facturadoDeCorte(c.clave, conduces, acuerdos, precios);
          return { ...c, meta: m, facturado: f, pct: m ? Math.round((f / m) * 100) : null };
        }),
    [cortes, metas, conduces, acuerdos, precios, hoy]
  );

  const pct = av.meta ? Math.min(Math.round((av.facturado / av.meta) * 100), 999) : 0;
  const pctEsperado = av.meta ? Math.round((av.esperadoHoy / av.meta) * 100) : 0;

  const titulo: Record<Avance["estado"], string> = {
    sin_meta: "Pon la meta de este corte para empezar a comparar.",
    no_empieza: "Este corte todavía no empieza.",
    cumplida: `Meta cumplida. Llevas ${rd(av.facturado)}, ${rd(Math.max(av.facturado - (av.meta ?? 0), 0))} por encima de la meta.`,
    por_encima: `Vas por encima del ritmo: llevas ${rd(av.facturado)} y a esta altura te tocaba ${rd(av.esperadoHoy)} (${rd(av.diferencia)} de ventaja).`,
    por_debajo: `Vas por debajo del ritmo: llevas ${rd(av.facturado)} y a esta altura te tocaba ${rd(av.esperadoHoy)} (te faltan ${rd(-av.diferencia)} para ir al día).`,
    cerrado_sin_cumplir: `El corte terminó: facturaste ${rd(av.facturado)} de ${rd(av.meta ?? 0)}. Faltaron ${rd(av.falta)}.`,
  };
  const tono = av.estado === "por_debajo" || av.estado === "cerrado_sin_cumplir" ? "alerta" : "resumen";

  return (
    <main className="wrap">
      <Nav activa="metas" />
      <div className="top">
        <h1>Metas</h1>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="me-corte">Corte</label>
        <select id="me-corte" value={clave} onChange={(e) => setClaveSel(e.target.value)}>
          {cortes.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.etiqueta}
            </option>
          ))}
        </select>
        <div className="hint">La meta es de facturación (horas por tarifa) en pesos, del 26 al 25.</div>
      </div>

      <div className="resumen">
        <div className="field" style={{ marginBottom: 8 }}>
          <label htmlFor="me-meta">Meta de este corte (RD$)</label>
          <input id="me-meta" inputMode="decimal" value={metaTxt} onChange={(e) => setMetaTxt(e.target.value)} />
          {meta == null && anterior?.meta != null && (
            <div className="hint">
              La del corte anterior fue {rd(anterior.meta)}.{" "}
              <button type="button" className="btn small" onClick={() => setMetaTxt(String(anterior.meta))}>
                Usar la misma
              </button>
            </div>
          )}
        </div>
        {msg && <div className="error">{msg}</div>}
        <div className="actions">
          <button
            className="btn primary"
            onClick={guardarMeta}
            disabled={guardando || aNumero(metaTxt) == null || aNumero(metaTxt) === meta}
          >
            {guardando ? "Guardando..." : meta == null ? "Guardar meta" : "Cambiar meta"}
          </button>
        </div>
      </div>

      {!cargando && (
        <>
          <div className={tono} style={{ marginBottom: 12, fontSize: 15 }}>
            {titulo[av.estado]}
          </div>

          {av.meta != null && (
            <>
              <div className="totales">
                <div className="total">
                  <div className="total-n">Facturado</div>
                  <div className="total-h" style={{ fontSize: 18 }}>{rd(av.facturado)}</div>
                  <div className="total-c">{fmtNum(av.horas, 2)} h aprobadas</div>
                </div>
                <div className="total">
                  <div className="total-n">Meta</div>
                  <div className="total-h" style={{ fontSize: 18 }}>{rd(av.meta)}</div>
                  <div className="total-c">{pct}% cumplido</div>
                </div>
                <div className="total">
                  <div className="total-n">Falta</div>
                  <div className="total-h" style={{ fontSize: 18 }}>{rd(av.falta)}</div>
                </div>
                <div className="total">
                  <div className="total-n">Días de trabajo</div>
                  <div className="total-h" style={{ fontSize: 18 }}>
                    {av.transcurridos} de {av.diasLaborables}
                  </div>
                  <div className="total-c">lunes a sábado</div>
                </div>
              </div>

              <div style={{ position: "relative", height: 16, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 4 }}>
                <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: "var(--brand)", borderRadius: 8 }} />
                <div
                  title="Dónde deberías ir hoy"
                  style={{ position: "absolute", left: `${Math.min(pctEsperado, 100)}%`, top: -3, bottom: -3, width: 2, background: "var(--muted)" }}
                />
              </div>
              <div className="hint" style={{ marginBottom: 12 }}>La rayita gris es dónde deberías ir hoy para cumplir.</div>

              <Grafica av={av} />
            </>
          )}

          {av.meta != null && av.estado !== "cumplida" && av.estado !== "no_empieza" && (
            <div className="resumen" style={{ marginTop: 12 }}>
              <b>{av.estado === "cerrado_sin_cumplir" ? "Cómo terminó" : "Qué tienes que hacer"}</b>
              {av.restantes > 0 && av.necesarioPorDia != null && (
                <div className="line">
                  Te quedan <b>{av.restantes}</b> días de trabajo. Para llegar a la meta hay que facturar{" "}
                  <b>{rd(av.necesarioPorDia)}</b> por día{av.promedioDia != null && <>; hasta ahora llevas {rd(av.promedioDia)} por día</>}.
                </div>
              )}
              {av.horasNecesariasPorDia != null && av.restantes > 0 && (
                <div className="line">
                  Con tu tarifa promedio de {rd(av.tarifaPromedio ?? 0)} por hora, son unas{" "}
                  <b>{fmtNum(av.horasNecesariasPorDia, 1)} horas de máquina por día</b> entre todas
                  {av.transcurridos > 0 && <> (hasta ahora promedias {fmtNum(av.horas / av.transcurridos, 1)})</>}.
                </div>
              )}
              {av.horasQueFaltan != null && av.restantes === 0 && (
                <div className="line">Faltaron unas {fmtNum(av.horasQueFaltan, 0)} horas de máquina para llegar.</div>
              )}
              {av.proyeccion != null && av.restantes > 0 && (
                <div className="line">
                  Si sigues a este ritmo cerrarás en <b>{rd(av.proyeccion)}</b> ({Math.round((av.proyeccion / av.meta) * 100)}% de la meta).
                </div>
              )}
            </div>
          )}

          {av.dolaresSinTasa && (
            <div className="alerta" style={{ marginTop: 8 }}>
              Hay acuerdos en dólares y todavía no hay tasa del dólar guardada (se pone el día 25 en Combustible): esas
              horas no se están contando.
            </div>
          )}
          {av.pendientesHoras > 0 && (
            <div className="aviso" style={{ marginTop: 8 }}>
              Hay {fmtNum(av.pendientesHoras, 2)} h de conduces sin aprobar que todavía no cuentan.
            </div>
          )}

          <div className="actions" style={{ marginTop: 12 }}>
            <button className="btn small" onClick={() => setVerDias(!verDias)}>
              {verDias ? "Ocultar día por día" : "Ver día por día"}
            </button>
          </div>
          {verDias && (
            <div style={{ marginTop: 8 }}>
              {av.dias
                .filter((d) => d.fecha <= (av.clave < hoy ? av.clave : hoy))
                .reverse()
                .map((d) => (
                  <div className="card" key={d.fecha} style={{ cursor: "default", opacity: d.laborable ? 1 : 0.6 }}>
                    <div className="row">
                      <div>
                        <h2>
                          {nombreDia(d.fecha)} {fmtFecha(d.fecha)}
                        </h2>
                        <div className="line">
                          {d.horas > 0 ? `${fmtNum(d.horas, 2)} h · ${rd(d.facturado)}` : d.laborable ? "Sin horas" : "Domingo"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="total-h" style={{ fontSize: 16 }}>{rd(d.acumulado)}</div>
                        {av.meta != null && (
                          <div className="total-c" style={{ color: d.acumulado >= d.esperado ? undefined : "var(--danger)" }}>
                            {d.acumulado >= d.esperado ? "+" : "−"}
                            {rd(Math.abs(d.acumulado - d.esperado))} vs meta
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          <h2 style={{ fontSize: 18, margin: "20px 0 8px" }}>Mes por mes</h2>
          {historial.length === 0 && <div className="hint">Cuando pasen los cortes, aquí los vas comparando.</div>}
          {historial.map((h) => (
            <div className="resumen" key={h.clave} style={{ marginBottom: 8 }}>
              <b>{h.etiqueta}</b>
              <div className="line">
                Facturado {rd(h.facturado)}
                {h.meta != null ? ` de ${rd(h.meta)} (${h.pct}%)` : " · sin meta puesta"}
              </div>
              {h.meta != null && (
                <div style={{ height: 8, background: "var(--line)", borderRadius: 4, marginTop: 6 }}>
                  <div
                    style={{
                      width: `${Math.min(h.pct ?? 0, 100)}%`,
                      height: "100%",
                      borderRadius: 4,
                      background: (h.pct ?? 0) >= 100 ? "var(--brand)" : "var(--taller)",
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </main>
  );
}
