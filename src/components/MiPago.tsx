"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtMonto, fmtNum, hoyRD } from "@/lib/machines";
import type { Conduce } from "@/lib/conduces";
import {
  aAjusteRow,
  aDeudaRow,
  aDescuentoRow,
  aPagoRow,
  aPerfilPago,
  calcularDias,
  fmtCorta,
  planDescuentos,
  quincenaAnterior,
  quincenaDe,
  redondear2,
  resumenPendiente,
  saldoDeuda,
  totalizar,
  type AjusteRow,
  type DescuentoRow,
  type DeudaRow,
  type PagoRow,
  type PerfilPago,
  type Quincena,
} from "@/lib/pagos";

const dinero = (n: number) => fmtMonto(n, "DOP");

// Lo que ve el operador de su propio pago: horas, ganancia, deudas y si ya se le pagó.
export default function MiPago({ uid, conduces }: { uid: string; conduces: Conduce[] }) {
  const [perfil, setPerfil] = useState<PerfilPago | null>(null);
  const [feriados, setFeriados] = useState<Record<string, string>>({});
  const [ajustes, setAjustes] = useState<AjusteRow[]>([]);
  const [deudas, setDeudas] = useState<DeudaRow[]>([]);
  const [descuentos, setDescuentos] = useState<DescuentoRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return;
    const supabase = createClient();
    Promise.all([
      supabase
        .from("perfiles")
        .select("user_id, nombre, activo, tarifa_hora, paga_desde, dieta_diaria, combustible_diario")
        .eq("user_id", uid)
        .maybeSingle(),
      supabase.from("feriados").select("fecha, nombre"),
      supabase.from("dias_operador").select("*").eq("user_id", uid),
      supabase.from("deudas").select("*").eq("user_id", uid),
      supabase.from("descuentos_deuda").select("*").eq("user_id", uid),
      supabase.from("pagos_operador").select("*").eq("user_id", uid).order("fecha_pago", { ascending: false }),
    ]).then(([p, f, a, d, ds, pg]) => {
      const fallo = p.error ?? f.error ?? a.error ?? d.error ?? ds.error ?? pg.error;
      if (fallo) return setError(`No se pudo cargar tu pago: ${fallo.message}`);
      setPerfil(p.data ? aPerfilPago(p.data) : null);
      const m: Record<string, string> = {};
      (f.data ?? []).forEach((x: { fecha: string; nombre: string }) => (m[x.fecha] = x.nombre));
      setFeriados(m);
      setAjustes((a.data ?? []).map(aAjusteRow));
      setDeudas((d.data ?? []).map(aDeudaRow));
      setDescuentos((ds.data ?? []).map(aDescuentoRow));
      setPagos((pg.data ?? []).map(aPagoRow));
    });
  }, [uid, conduces.length]);

  const hoy = hoyRD();
  const conducesDia = useMemo(
    () =>
      conduces
        .filter((c) => c.estado !== "Rechazado")
        .map((c) => ({ fecha: c.fecha, horas: Number(c.horas_cobrables), aprobado: c.estado === "Aprobado" })),
    [conduces]
  );
  const ajustesMapa = useMemo(() => {
    const m: Record<string, { horas: number; motivo: string | null; fueAlCampo: boolean }> = {};
    ajustes.forEach((a) => (m[a.fecha] = { horas: a.horas, motivo: a.motivo, fueAlCampo: a.fue_al_campo }));
    return m;
  }, [ajustes]);

  if (error) return <div className="error">{error}</div>;
  if (!perfil) return null;

  const actual = quincenaDe(hoy);
  const anterior = quincenaAnterior(actual);
  const res = resumenPendiente({
    perfil,
    hoy,
    conduces: conducesDia,
    feriados,
    ajustes: ajustesMapa,
    deudas,
    descuentos,
    pagos,
  });
  const pagoDe = (q: Quincena) =>
    pagos.find((p) => p.tipo === "quincena" && p.periodo_inicio === q.inicio && p.periodo_fin === q.fin);

  function bloque(q: Quincena, titulo: string) {
    const pago = pagoDe(q);
    const dias = calcularDias({
      inicio: q.inicio,
      fin: q.fin,
      pagaDesde: perfil!.paga_desde,
      hoy,
      conduces: conducesDia,
      feriados,
      ajustes: ajustesMapa,
    });
    const tot = totalizar(dias, perfil!.tarifa_hora);
    const plan = planDescuentos(deudas, descuentos, tot.bruto);
    const descontar = redondear2(plan.reduce((a, l) => a + l.descuento, 0));
    return (
      <div className="resumen" key={q.inicio}>
        <b>{titulo}</b>
        <div className="line" style={{ margin: "2px 0 6px" }}>
          {q.etiqueta}
        </div>
        {pago ? (
          <>
            <div>
              <span className="pill disp">Pagado el {fmtCorta(pago.fecha_pago)}</span>
            </div>
            <div>
              {fmtNum(pago.horas, 2)} h · ganaste {dinero(pago.bruto)}
            </div>
            {pago.descuento_deudas > 0 && <div>Descontado por deudas: {dinero(pago.descuento_deudas)}</div>}
            <div>
              Te pagaron: <b>{dinero(pago.neto)}</b>
            </div>
          </>
        ) : (
          <>
            {perfil!.paga_desde == null && (
              <div className="aviso">
                El administrador todavía no ha puesto desde cuándo empiezas a cobrar. Cuando lo ponga, aquí van a salir
                tus horas.
              </div>
            )}
            <div>
              Horas acumuladas: <b>{fmtNum(tot.horas, 2)} h</b>
            </div>
            {perfil!.tarifa_hora != null ? (
              <>
                <div>
                  Ganado hasta hoy: <b>{dinero(tot.bruto)}</b> ({dinero(perfil!.tarifa_hora)} por hora)
                </div>
                {descontar > 0 && <div>Descuento por deudas: {dinero(descontar)}</div>}
                <div>
                  Te tocaría cobrar: <b>{dinero(redondear2(tot.bruto - descontar))}</b>
                </div>
              </>
            ) : (
              <div className="aviso">Tu precio por hora todavía no está puesto.</div>
            )}
            {tot.pendientes > 0 && (
              <div className="aviso">{fmtNum(tot.pendientes, 2)} h todavía esperan que el administrador apruebe tu conduce.</div>
            )}
            <div>
              <span className="pill obra">Sin pagar todavía</span>
            </div>
          </>
        )}
      </div>
    );
  }

  const debeTotal = redondear2(deudas.reduce((a, x) => a + saldoDeuda(x, descuentos), 0));
  const recientes = pagos.slice(0, 5);

  return (
    <>
      <div className="totales">
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
          <div className="total-n">Total a recibir</div>
          <div className="total-h">{perfil.tarifa_hora != null ? dinero(res.total) : "—"}</div>
          <div className="total-c">con dieta y combustible, menos deudas</div>
        </div>
      </div>
      {perfil.tarifa_hora == null && (
        <div className="aviso" style={{ marginBottom: 12 }}>
          Tu precio por hora todavía no está puesto.
        </div>
      )}
      {res.campo.dias > 0 && (
        <div className="resumen">
          <b>Dieta y combustible por cobrar el lunes</b>
          <div>
            {res.campo.dias} {res.campo.dias === 1 ? "día" : "días"} en el campo · dieta {dinero(res.campo.dieta)} +
            combustible {dinero(res.campo.combustible)}
          </div>
        </div>
      )}

      {!pagoDe(anterior) && perfil.paga_desde != null && perfil.paga_desde <= anterior.fin && bloque(anterior, "Quincena anterior")}
      {bloque(actual, "Quincena en curso")}

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
            <div key={p.id} className="row" style={{ marginTop: 4 }}>
              <span>
                {p.tipo === "quincena" ? "Quincena" : "Dieta y combustible"} · {fmtCorta(p.periodo_inicio)} al{" "}
                {fmtCorta(p.periodo_fin)}
                <br />
                <span className="pill disp">Pagado el {fmtCorta(p.fecha_pago)}</span>
              </span>
              <b>{dinero(p.neto)}</b>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
