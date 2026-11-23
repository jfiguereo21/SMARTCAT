"use client";

import { useMemo, useState } from "react";
import { fmtNum } from "@/lib/machines";
import {
  calcularDias,
  fmtCorta,
  mapaAjustes,
  nombreDia,
  quincenaDe,
  sumarDias,
  totalizar,
  ultimoLunes,
  type AjusteRow,
  type DiaPago,
  type PagoRow,
  type PerfilPago,
  type ReporteDiaRow,
  type TratoRow,
} from "@/lib/pagos";

export type ConduceHoras = {
  fecha: string;
  estado: string;
  horas_cobrables: number;
  tramos?: { entrada: string; salida: string }[] | null;
};

const MAX_HORAS_DIA = 12; // más que esto en un día se marca como raro
const ENTRADA_MUY_TEMPRANO = "04:00"; // un tramo que empieza antes de esta hora se marca
const SALIDA_MUY_TARDE = "22:00"; // un tramo que termina después de esta hora se marca

const dif = (a: number, b: number) => Math.abs(a - b) > 0.005;

// Por qué un día merece revisarse (lista vacía = nada raro)
function alertasDia(d: DiaPago, conduces: ConduceHoras[]): string[] {
  const a: string[] = [];
  if (d.horasConduce > MAX_HORAS_DIA) a.push(`Más de ${MAX_HORAS_DIA} horas en un día`);
  for (const c of conduces) {
    for (const t of c.tramos ?? []) {
      if (t.entrada && t.entrada < ENTRADA_MUY_TEMPRANO) a.push(`Un tramo empieza a las ${t.entrada}`);
      if (t.salida && t.salida > SALIDA_MUY_TARDE) a.push(`Un tramo termina a las ${t.salida}`);
    }
  }
  if (d.tipo === "doble") a.push(d.feriado ? `Festivo (${d.feriado}): se paga doble` : "Domingo: se paga doble");
  return [...new Set(a)];
}

function FilaDia({ d, alertas }: { d: DiaPago; alertas: string[] }) {
  const distinto = dif(d.horasConduce, d.horasPagadas);
  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
      <div className="row">
        <span>
          <b style={{ textTransform: "capitalize" }}>
            {nombreDia(d.fecha)} {fmtCorta(d.fecha)}
          </b>
          {alertas.length > 0 && <span title={alertas.join(". ")}> ⚠️</span>}
        </span>
        <span style={{ textAlign: "right" }}>
          {d.tipo === "ajuste" ? (
            <b>{fmtNum(d.horasPagadas, 2)} h</b>
          ) : distinto ? (
            <b>
              {fmtNum(d.horasConduce, 2)} h → {fmtNum(d.horasPagadas, 2)} h
            </b>
          ) : (
            <b>{fmtNum(d.horasPagadas, 2)} h</b>
          )}
        </span>
      </div>
      {d.tipo === "ajuste" && <div className="line" style={{ marginTop: 2 }}>{d.nota ?? "Horas puestas por el administrador"}</div>}
      {d.horasPendientes > 0 && (
        <div className="line" style={{ marginTop: 2 }}>
          + {fmtNum(d.horasPendientes, 2)} h por aprobar (todavía no se cuentan)
        </div>
      )}
      {alertas.map((t) => (
        <div key={t} className="line" style={{ marginTop: 2 }}>
          ⚠️ {t}
        </div>
      ))}
    </div>
  );
}

// Para el administrador: las horas de un operador día por día, agrupadas por semana y por quincena.
// Solo horas, sin dinero. Usa las mismas reglas que el pago (mínimo por día, redondeo, domingos dobles).
export default function HorasPorDia({
  perfil,
  conduces,
  feriados,
  ajustes,
  reportes,
  tratos,
  pagos,
  hoy,
  abiertoInicial = false,
}: {
  perfil: PerfilPago;
  conduces: ConduceHoras[]; // solo los de este operador
  feriados: Record<string, string>;
  ajustes: AjusteRow[];
  reportes: ReporteDiaRow[];
  tratos: TratoRow[];
  pagos: PagoRow[];
  hoy: string;
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);

  const quincenas = useMemo(() => {
    if (!abierto || !perfil.paga_desde) return [];
    const vivos = conduces.filter((c) => c.estado !== "Rechazado");
    const dias = calcularDias({
      inicio: perfil.paga_desde,
      fin: hoy,
      pagaDesde: perfil.paga_desde,
      hoy,
      conduces: vivos.map((c) => ({ fecha: c.fecha, horas: c.horas_cobrables, aprobado: c.estado === "Aprobado" })),
      feriados,
      ajustes: mapaAjustes(ajustes, reportes),
      trato: perfil,
      tratos,
    });
    const porFecha = new Map<string, ConduceHoras[]>();
    for (const c of vivos) porFecha.set(c.fecha, [...(porFecha.get(c.fecha) ?? []), c]);

    const grupos = new Map<string, DiaPago[]>();
    for (const d of dias) {
      const q = quincenaDe(d.fecha);
      const k = `${q.inicio}|${q.fin}`;
      grupos.set(k, [...(grupos.get(k) ?? []), d]);
    }
    return [...grupos.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([k, ds]) => {
        const [inicio, fin] = k.split("|");
        const q = quincenaDe(inicio);
        const t = totalizar(ds, perfil.tarifa_hora);
        const pagada = pagos.some((p) => p.tipo === "quincena" && p.periodo_inicio === inicio && p.periodo_fin === fin);
        const semanas = new Map<string, DiaPago[]>();
        for (const d of ds) {
          const lunes = ultimoLunes(d.fecha);
          semanas.set(lunes, [...(semanas.get(lunes) ?? []), d]);
        }
        const listaSemanas = [...semanas.entries()]
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([lunes, sd]) => ({
            lunes,
            domingo: sumarDias(lunes, 6),
            pagadas: sd.reduce((s, d) => s + d.horasPagadas, 0),
            conduce: sd.reduce((s, d) => s + d.horasConduce, 0),
            // solo los días con algo que mostrar, el más nuevo primero
            dias: [...sd]
              .filter((d) => d.horasConduce > 0 || d.horasPagadas > 0 || d.horasPendientes > 0)
              .reverse()
              .map((d) => ({ d, alertas: alertasDia(d, porFecha.get(d.fecha) ?? []) })),
          }))
          // una semana sin horas dentro de esta quincena no se muestra
          .filter((s) => s.dias.length > 0);
        return {
          inicio,
          fin,
          fechaPago: q.fechaPago,
          pagada,
          horas: t.horas,
          conduce: ds.reduce((s, d) => s + d.horasConduce, 0),
          semanas: listaSemanas,
        };
      });
  }, [abierto, perfil, conduces, feriados, ajustes, reportes, tratos, pagos, hoy]);

  if (!perfil.paga_desde) {
    return (
      <div className="hint" style={{ margin: "-4px 0 12px" }}>
        Todavía no tiene fecha de "paga desde", por eso no hay horas por día.
      </div>
    );
  }

  return (
    <div style={{ margin: "-4px 0 14px" }}>
      <button className="btn" style={{ width: "100%" }} onClick={() => setAbierto((v) => !v)}>
        {abierto ? "Cerrar las horas por día" : "Ver horas por día"}
      </button>
      {abierto && (
        <div className="resumen" style={{ marginTop: 8 }}>
          {quincenas.length === 0 && <div className="line">Todavía no hay días para mostrar.</div>}
          {quincenas.map((q, i) => (
            <details key={q.inicio} open={i === 0} style={{ marginTop: i === 0 ? 0 : 10 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                Quincena {fmtCorta(q.inicio)} al {fmtCorta(q.fin)} · {fmtNum(q.horas, 2)} h
              </summary>
              <div style={{ margin: "6px 0" }}>
                <span className={`pill ${q.pagada ? "disp" : "taller"}`}>
                  {q.pagada ? "Ya pagada" : `Se paga el ${fmtCorta(q.fechaPago)}`}
                </span>
                {dif(q.conduce, q.horas) && (
                  <div className="line">
                    Horas de los conduces: {fmtNum(q.conduce, 2)} h. Las que se pagan son más por el mínimo del día y los
                    domingos dobles.
                  </div>
                )}
              </div>
              {q.semanas.map((s) => (
                <div key={s.lunes} style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>
                    Semana del {fmtCorta(s.lunes)} al {fmtCorta(s.domingo)} · {fmtNum(s.pagadas, 2)} h
                    {dif(s.conduce, s.pagadas) ? ` (conduces: ${fmtNum(s.conduce, 2)} h)` : ""}
                  </div>
                  {(s.lunes < q.inicio || s.domingo > q.fin) && (
                    <div className="line" style={{ marginTop: 0 }}>
                      Solo los días de esta semana que caen dentro de esta quincena.
                    </div>
                  )}
                  {s.dias.map(({ d, alertas }) => (
                    <FilaDia key={d.fecha} d={d} alertas={alertas} />
                  ))}
                </div>
              ))}
            </details>
          ))}
          <div className="hint" style={{ marginTop: 10 }}>
            Cuando salen dos números, por ejemplo "3.35 h → 8 h", el primero son las horas del conduce y el segundo las
            que se le pagan. ⚠️ marca los días que conviene revisar.
          </div>
        </div>
      )}
    </div>
  );
}
