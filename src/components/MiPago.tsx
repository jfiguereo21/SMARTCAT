"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtMonto, fmtNum, hoyRD } from "@/lib/machines";
import type { Conduce } from "@/lib/conduces";
import { BotonVoucher } from "@/components/VoucherPago";
import {
  aAjusteRow,
  aDeudaRow,
  aDescuentoRow,
  aPagoRow,
  aPerfilPago,
  aReporteDiaRow,
  aTratoRow,
  calcularDias,
  explicarDia,
  fmtCorta,
  mapaAjustes,
  nombreDia,
  quincenaDe,
  redondear2,
  resumenPendiente,
  saldoDeuda,
  totalizar,
  ultimoLunes,
  type DiaPago,
  type AjusteRow,
  type DescuentoRow,
  type DeudaRow,
  type PagoRow,
  type PerfilPago,
  type ReporteDiaRow,
  type TratoRow,
} from "@/lib/pagos";

const dinero = (n: number) => fmtMonto(n, "DOP");

// Lo que ve el operador de su propio pago: horas, ganancia, deudas y si ya se le pagó.
export default function MiPago({ uid, conduces, recarga = 0 }: { uid: string; conduces: Conduce[]; recarga?: number }) {
  const [perfil, setPerfil] = useState<PerfilPago | null>(null);
  const [feriados, setFeriados] = useState<Record<string, string>>({});
  const [ajustes, setAjustes] = useState<AjusteRow[]>([]);
  const [reportes, setReportes] = useState<ReporteDiaRow[]>([]);
  const [tratos, setTratos] = useState<TratoRow[]>([]);
  const [deudas, setDeudas] = useState<DeudaRow[]>([]);
  const [descuentos, setDescuentos] = useState<DescuentoRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [error, setError] = useState("");
  const [verDetalle, setVerDetalle] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("perfiles")
        .select("user_id, nombre, activo, tarifa_hora, paga_desde, dieta_diaria, combustible_diario, combustible_por, horas_sin_conduce, minimo_horas_dia, minimo_horas_sabado, dieta_siempre")
        .eq("user_id", uid)
        .maybeSingle(),
      supabase.from("feriados").select("fecha, nombre"),
      supabase.from("dias_operador").select("*").eq("user_id", uid),
      supabase.from("reportes_dia").select("*").eq("user_id", uid),
      supabase.from("tratos_operador").select("*").eq("user_id", uid),
      supabase.from("deudas").select("*").eq("user_id", uid),
      supabase.from("descuentos_deuda").select("*").eq("user_id", uid),
      supabase.from("pagos_operador").select("*").eq("user_id", uid).order("fecha_pago", { ascending: false }),
    ]).then(([p, f, a, rd, tr, d, ds, pg]) => {
      const fallo = p.error ?? f.error ?? a.error ?? rd.error ?? tr.error ?? d.error ?? ds.error ?? pg.error;
      if (fallo) return setError(`No se pudo cargar tu pago: ${fallo.message}`);
      setPerfil(p.data ? aPerfilPago(p.data) : null);
      const m: Record<string, string> = {};
      (f.data ?? []).forEach((x: { fecha: string; nombre: string }) => (m[x.fecha] = x.nombre));
      setFeriados(m);
      setAjustes((a.data ?? []).map(aAjusteRow));
      setReportes((rd.data ?? []).map(aReporteDiaRow));
      setTratos((tr.data ?? []).map(aTratoRow));
      setDeudas((d.data ?? []).map(aDeudaRow));
      setDescuentos((ds.data ?? []).map(aDescuentoRow));
      setPagos((pg.data ?? []).map(aPagoRow));
    });
  }, [uid, conduces.length, recarga]);

  const hoy = hoyRD();
  const conducesDia = useMemo(
    () =>
      conduces
        .filter((c) => c.estado !== "Rechazado")
        .map((c) => ({ fecha: c.fecha, horas: Number(c.horas_cobrables), aprobado: c.estado === "Aprobado" })),
    [conduces]
  );
  const ajustesMapa = useMemo(() => mapaAjustes(ajustes, reportes), [ajustes, reportes]);

  // Día por día, agrupado por quincena (la más nueva primero)
  const quincenas = useMemo(() => {
    if (!perfil?.paga_desde) return [];
    const dias = calcularDias({
      inicio: perfil.paga_desde,
      fin: hoy,
      pagaDesde: perfil.paga_desde,
      hoy,
      conduces: conducesDia,
      feriados,
      ajustes: ajustesMapa,
      trato: perfil,
      tratos,
    });
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
        return { inicio, fin, fechaPago: q.fechaPago, dias: [...ds].reverse(), horas: t.horas, bruto: t.bruto, pagada };
      });
  }, [perfil, hoy, conducesDia, feriados, ajustesMapa, tratos, pagos]);

  if (error) return <div className="error">{error}</div>;
  if (!perfil) return null;

  const res = resumenPendiente({
    perfil,
    hoy,
    conduces: conducesDia,
    feriados,
    ajustes: ajustesMapa,
    tratos,
    deudas,
    descuentos,
    pagos,
  });

  const debeTotal = redondear2(deudas.reduce((a, x) => a + saldoDeuda(x, descuentos), 0));
  const recientes = pagos.slice(0, 5);

  return (
    <>
      <div className="totales dos">
        <div className="total">
          <div className="total-n">Horas acumuladas</div>
          <div className="total-h">{fmtNum(res.horas, 2)} h</div>
          <div className="total-c">por cobrar</div>
        </div>
        <div className="total">
          <div className="total-n">Ganado a la fecha</div>
          <div className="total-h">{perfil.tarifa_hora != null ? dinero(res.ganado) : "—"}</div>
        </div>
        <div className="total">
          <div className="total-n">Debes</div>
          <div className="total-h">{dinero(res.debe)}</div>
        </div>
        <div className="total">
          <div className="total-n">Pago de la quincena</div>
          <div className="total-h">{perfil.tarifa_hora != null ? dinero(res.ganado - res.descuento) : "—"}</div>
          <div className="total-c">
            {res.proximoPago ? `se paga el ${fmtCorta(res.proximoPago)} · ` : ""}solo horas
            {res.descuento > 0 ? `, menos ${dinero(res.descuento)} de deuda` : ""}
          </div>
        </div>
      </div>
      <button className="btn primary" style={{ width: "100%", marginBottom: 12 }} onClick={() => setVerDetalle((v) => !v)}>
        {verDetalle ? "Cerrar el detalle" : "Ver día por día cómo se pagan mis horas"}
      </button>
      {verDetalle && (
        <div className="resumen">
          <b>Tus horas día por día</b>
          <div className="line">
            Aquí ves cada día, cuántas horas se te pagan y por qué. La dieta y el combustible no se mezclan con esto:
            se pagan aparte, los lunes.
          </div>
          {quincenas.length === 0 && <div className="line">Todavía no hay días para mostrar.</div>}
          {quincenas.map((q) => (
            <div key={q.inicio} style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700 }}>
                Del {fmtCorta(q.inicio)} al {fmtCorta(q.fin)}
              </div>
              <div>
                <span className={`pill ${q.pagada ? "disp" : "taller"}`}>
                  {q.pagada ? "Ya pagada" : `Se paga el ${fmtCorta(q.fechaPago)}`}
                </span>
              </div>
              <div className="line">
                {fmtNum(q.horas, 2)} horas
                {perfil.tarifa_hora != null || q.bruto > 0 ? ` = ${dinero(q.bruto)}` : ""}
              </div>
              {q.dias.map((d) => {
                const e = explicarDia(d);
                const tarifa = d.tarifa ?? perfil.tarifa_hora;
                const semanaPagada = pagos.some((p) => p.tipo === "semanal" && p.periodo_inicio === ultimoLunes(d.fecha));
                return (
                  <div key={d.fecha} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
                    <div className="row">
                      <span>
                        <b style={{ textTransform: "capitalize" }}>
                          {nombreDia(d.fecha)} {fmtCorta(d.fecha)}
                        </b>
                      </span>
                      <span style={{ textAlign: "right" }}>
                        <b>{fmtNum(d.horasPagadas, 2)} h</b>
                        {tarifa != null && d.horasPagadas > 0 && (
                          <div className="line" style={{ marginTop: 0 }}>
                            {fmtNum(d.horasPagadas, 2)} × {dinero(tarifa)} = {dinero(redondear2(d.horasPagadas * tarifa))}
                          </div>
                        )}
                      </span>
                    </div>
                    <div style={{ marginTop: 4 }}>{e.titulo}</div>
                    <div className="line" style={{ marginTop: 2 }}>
                      {e.detalle}
                    </div>
                    {d.fueAlCampo && (d.dieta > 0 || d.combustible > 0) && (
                      <div className="line" style={{ marginTop: 4 }}>
                        Aparte, el lunes: dieta {dinero(d.dieta)}
                        {d.combustible > 0 ? ` + combustible ${dinero(redondear2(d.combustible))}` : ""}
                        {semanaPagada ? " (ya pagado)" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {perfil.paga_desde == null ? (
        <div className="aviso" style={{ marginBottom: 12 }}>
          El administrador todavía no ha puesto desde cuándo empiezas a cobrar. Cuando lo ponga, aquí van a salir tus
          horas.
        </div>
      ) : (
        res.proximoPago && (
          <div className="hint" style={{ marginBottom: 12 }}>
            Próximo pago: {fmtCorta(res.proximoPago)}
            {res.horasPorAprobar > 0 ? ". Tienes conduces esperando aprobación; se suman cuando el administrador los apruebe." : ""}
          </div>
        )
      )}
      {perfil.tarifa_hora == null && (
        <div className="aviso" style={{ marginBottom: 12 }}>
          Tu precio por hora todavía no está puesto.
        </div>
      )}
      {res.campo.dias > 0 && (
        <div className="resumen">
          <b>Aparte: dieta y combustible (se pagan los lunes)</b>
          <div>
            {res.campo.dias} {res.campo.dias === 1 ? "día" : "días"} en el campo
          </div>
          <div>Dieta: {dinero(res.campo.dieta)}</div>
          <div>Combustible: {dinero(res.campo.combustible)}</div>
          <div>
            Total de dieta y combustible: <b>{dinero(res.campo.dieta + res.campo.combustible)}</b>
          </div>
          <div className="line">Este dinero no es parte del pago de la quincena.</div>
        </div>
      )}

      {debeTotal > 0 && (
        <div className="resumen">
          <b>Lo que debes</b>
          {deudas
            .map((x) => ({ x, saldo: saldoDeuda(x, descuentos) }))
            .filter((y) => y.saldo > 0)
            .map(({ x, saldo }) => (
              <div key={x.id}>
                {x.concepto}: {dinero(saldo)}
                {x.descuento_por_pago != null ? ` (se descuenta ${dinero(x.descuento_por_pago)} por pago)` : ""}
              </div>
            ))}
          <div>
            Total: <b>{dinero(debeTotal)}</b>
          </div>
        </div>
      )}

      {recientes.length > 0 && (
        <div className="resumen">
          <b>Pagos que te han hecho</b>
          {recientes.map((p) => (
            <div key={p.id} style={{ marginTop: 8 }}>
              <div className="row">
                <span>
                  {p.tipo === "quincena" ? "Quincena" : "Dieta y combustible"} · {fmtCorta(p.periodo_inicio)} al{" "}
                  {fmtCorta(p.periodo_fin)}
                  <br />
                  <span className="pill disp">Pagado el {fmtCorta(p.fecha_pago)}</span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <b>{dinero(p.neto)}</b>
                  {p.voucher_path && (
                    <div style={{ marginTop: 6 }}>
                      <BotonVoucher path={p.voucher_path} />
                    </div>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
