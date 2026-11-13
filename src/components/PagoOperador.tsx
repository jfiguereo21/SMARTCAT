"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { aNumero, fmtMonto, fmtNum, hoyRD } from "@/lib/machines";
import { CampoVoucher, VoucherDePago, subirVoucher } from "@/components/VoucherPago";
import {
  calcularDias,
  etiquetaTipo,
  fmtCorta,
  mapaAjustes,
  nombreDia,
  planDescuentos,
  quincenaAnterior,
  quincenaDe,
  quincenaSiguiente,
  redondear2,
  saldoDeuda,
  semanaPagadaEl,
  sumarDias,
  totalCampo,
  totalizar,
  ultimoLunes,
  type AjusteRow,
  type ConduceDia,
  type DescuentoRow,
  type DeudaRow,
  type DiaPago,
  type PagoRow,
  type PerfilPago,
  type Quincena,
  type ReporteDiaRow,
  type TratoRow,
} from "@/lib/pagos";

export type DatosOperador = {
  perfil: PerfilPago;
  conduces: ConduceDia[];
  feriados: Record<string, string>;
  ajustes: AjusteRow[];
  reportes: ReporteDiaRow[];
  tratos: TratoRow[];
  deudas: DeudaRow[];
  descuentos: DescuentoRow[];
  pagos: PagoRow[];
};

type Vista = "quincena" | "semana" | "deudas" | "historial";

const dinero = (n: number) => fmtMonto(n, "DOP");

async function idAdmin(): Promise<string | null> {
  const { data } = await createClient().auth.getUser();
  return data.user?.id ?? null;
}

// Botón que pide un segundo toque para confirmar.
function BotonConfirmar({
  texto,
  confirmar,
  onClick,
  disabled,
}: {
  texto: string;
  confirmar: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [listo, setListo] = useState(false);
  return (
    <button
      type="button"
      className={`btn small danger${listo ? " armed" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (!listo) {
          setListo(true);
          setTimeout(() => setListo(false), 5000);
          return;
        }
        setListo(false);
        onClick();
      }}
    >
      {listo ? confirmar : texto}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------------
// Ajuste manual de un día
// ---------------------------------------------------------------------------------------------------

function AjusteDia({
  userId,
  dia,
  ajuste,
  onClose,
  onSaved,
}: {
  userId: string;
  dia: DiaPago;
  ajuste: AjusteRow | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [horas, setHoras] = useState(ajuste ? String(ajuste.horas) : String(dia.horasPagadas));
  const [motivo, setMotivo] = useState(ajuste?.motivo ?? "");
  const [fueAlCampo, setFueAlCampo] = useState(ajuste ? ajuste.fue_al_campo : dia.fueAlCampo);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(h: number, m: string, campo: boolean = fueAlCampo) {
    setError("");
    if (m.trim() === "") return setError("Escribe el motivo, por ejemplo: faltó o la máquina estaba en el taller.");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("dias_operador")
      .upsert({ user_id: userId, fecha: dia.fecha, horas: h, motivo: m.trim(), fue_al_campo: campo });
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    onSaved();
  }

  async function quitar() {
    setGuardando(true);
    const { error: err } = await createClient().from("dias_operador").delete().eq("user_id", userId).eq("fecha", dia.fecha);
    setGuardando(false);
    if (err) return setError(`No se pudo quitar: ${err.message}`);
    onSaved();
  }

  const h = aNumero(horas);

  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>
          {nombreDia(dia.fecha)} {fmtCorta(dia.fecha)}
        </h2>
        {error && <div className="error">{error}</div>}
        <div className="resumen">
          <div>{etiquetaTipo[dia.tipo]}</div>
          {dia.feriado && <div>Festivo: {dia.feriado}</div>}
          <div>Conduces aprobados ese día: {fmtNum(dia.horasConduce, 2)} h</div>
        </div>

        <div className="field">
          <label>Cuando no corresponde la regla</label>
          <div className="actions">
            <button type="button" className="btn small" disabled={guardando} onClick={() => guardar(0, "Faltó", false)}>
              Faltó (0 h)
            </button>
            <button type="button" className="btn small" disabled={guardando} onClick={() => guardar(0, "Máquina en el taller", false)}>
              Taller (0 h)
            </button>
            <button type="button" className="btn small" disabled={guardando} onClick={() => guardar(0, "Vacaciones", false)}>
              Vacaciones (0 h)
            </button>
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="aj-horas">Horas a pagar ese día</label>
            <input id="aj-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="aj-motivo">Motivo</label>
            <input id="aj-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={fueAlCampo} onChange={(e) => setFueAlCampo(e.target.checked)} />
          Fue al campo ese día (cobra dieta y combustible)
        </label>

        <div className="actions">
          <button
            type="button"
            className="btn primary grow"
            disabled={guardando || h == null || h < 0}
            onClick={() => guardar(h ?? 0, motivo)}
          >
            {guardando ? "Guardando..." : "Guardar ajuste"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          {ajuste && (
            <button type="button" className="btn danger" onClick={quitar} disabled={guardando}>
              Volver a la regla
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Quincena
// ---------------------------------------------------------------------------------------------------

function VistaQuincena({ d, onChanged }: { d: DatosOperador; onChanged: () => void }) {
  const hoy = hoyRD();
  const { perfil } = d;
  const actual = quincenaDe(hoy);
  const anterior = quincenaAnterior(actual);
  const pagadaQ = (q: Quincena) =>
    d.pagos.some((p) => p.tipo === "quincena" && p.periodo_inicio === q.inicio && p.periodo_fin === q.fin);

  const [q, setQ] = useState<Quincena>(pagadaQ(anterior) ? actual : anterior);
  const [montos, setMontos] = useState<Record<string, string>>({});
  const [fechaPago, setFechaPago] = useState(hoy);
  const [nota, setNota] = useState("");
  const [voucher, setVoucher] = useState<File | null>(null);
  const [editDia, setEditDia] = useState<DiaPago | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setMontos({});
    setError("");
  }, [q.inicio]);

  const ajustesMapa = useMemo(() => mapaAjustes(d.ajustes, d.reportes), [d.ajustes, d.reportes]);

  const dias = useMemo(
    () =>
      calcularDias({
        inicio: q.inicio,
        fin: q.fin,
        pagaDesde: perfil.paga_desde,
        hoy,
        conduces: d.conduces,
        feriados: d.feriados,
        ajustes: ajustesMapa,
        trato: perfil,
        tratos: d.tratos,
      }),
    [q, perfil.paga_desde, perfil, d.tratos, hoy, d.conduces, d.feriados, ajustesMapa]
  );
  const tot = totalizar(dias, perfil.tarifa_hora);
  const pago = d.pagos.find((p) => p.tipo === "quincena" && p.periodo_inicio === q.inicio && p.periodo_fin === q.fin);

  const plan = useMemo(() => planDescuentos(d.deudas, d.descuentos, tot.bruto), [d.deudas, d.descuentos, tot.bruto]);
  const montoDe = (id: string, sugerido: number) => aNumero(montos[id] ?? String(sugerido)) ?? 0;
  const totalDescuento = redondear2(plan.reduce((a, l) => a + montoDe(l.deuda.id, l.descuento), 0));
  const neto = redondear2(tot.bruto - totalDescuento);

  const faltaTarifa = perfil.tarifa_hora == null;
  const faltaDesde = perfil.paga_desde == null;
  const periodoTerminado = q.fin < hoy;

  async function registrar() {
    setError("");
    if (faltaTarifa || faltaDesde) return setError("Falta la tarifa o la fecha desde la que cobra. Se ponen en Operadores.");
    for (const l of plan) {
      const m = montoDe(l.deuda.id, l.descuento);
      if (m < 0) return setError("Un descuento no puede ser negativo.");
      if (m > l.saldo) return setError(`"${l.deuda.concepto}" solo debe ${dinero(l.saldo)}.`);
    }
    if (totalDescuento > tot.bruto) return setError("Los descuentos no pueden ser más de lo que gana en la quincena.");

    setGuardando(true);
    const supabase = createClient();
    let voucherPath: string | null = null;
    if (voucher) {
      try {
        voucherPath = await subirVoucher(voucher, perfil.user_id, `quincena-${q.fin}`);
      } catch (ex) {
        setGuardando(false);
        return setError(ex instanceof Error ? ex.message : "No se pudo subir el voucher.");
      }
    }
    const { data: nuevo, error: e1 } = await supabase
      .from("pagos_operador")
      .insert({
        user_id: perfil.user_id,
        tipo: "quincena",
        periodo_inicio: q.inicio,
        periodo_fin: q.fin,
        fecha_pago: fechaPago,
        horas: tot.horas,
        tarifa_hora: perfil.tarifa_hora,
        bruto: tot.bruto,
        descuento_deudas: totalDescuento,
        nota: nota.trim() || null,
        voucher_path: voucherPath,
        creado_por: await idAdmin(),
      })
      .select("id")
      .single();
    if (e1 || !nuevo) {
      if (voucherPath) await supabase.storage.from("conduces").remove([voucherPath]);
      setGuardando(false);
      if (e1?.code === "23505") return setError("Esta quincena ya tiene un pago registrado.");
      return setError(`No se pudo registrar el pago: ${e1?.message ?? "error desconocido"}`);
    }
    const filas = plan
      .map((l) => ({ l, m: montoDe(l.deuda.id, l.descuento) }))
      .filter((x) => x.m > 0)
      .map((x) => ({ deuda_id: x.l.deuda.id, user_id: perfil.user_id, pago_id: nuevo.id, monto: x.m, fecha: fechaPago }));
    if (filas.length > 0) {
      const { error: e2 } = await supabase.from("descuentos_deuda").insert(filas);
      if (e2) {
        await supabase.from("pagos_operador").delete().eq("id", nuevo.id);
        if (voucherPath) await supabase.storage.from("conduces").remove([voucherPath]);
        setGuardando(false);
        return setError(`No se pudieron descontar las deudas, el pago no se registró: ${e2.message}`);
      }
    }
    setGuardando(false);
    setNota("");
    setVoucher(null);
    onChanged();
  }

  async function anular() {
    if (!pago) return;
    setGuardando(true);
    const { error: err } = await createClient().from("pagos_operador").delete().eq("id", pago.id);
    setGuardando(false);
    if (err) return setError(`No se pudo anular: ${err.message}`);
    onChanged();
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 8, gap: 8 }}>
        <button className="btn small" onClick={() => setQ(quincenaAnterior(q))}>
          ← Anterior
        </button>
        <div style={{ textAlign: "center", fontWeight: 600 }}>
          {q.etiqueta}
          {pagadaQ(q) && (
            <div>
              <span className="pill disp">Pagada</span>
            </div>
          )}
        </div>
        <button className="btn small" onClick={() => setQ(quincenaSiguiente(q))} disabled={q.inicio > hoy}>
          Siguiente →
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {faltaDesde && (
        <div className="aviso" style={{ marginBottom: 8 }}>
          Falta la fecha desde la que cobra este operador. Ponla en la pestaña Operadores.
        </div>
      )}
      {faltaTarifa && (
        <div className="aviso" style={{ marginBottom: 8 }}>
          Falta la tarifa por hora. Ponla en la pestaña Operadores.
        </div>
      )}
      {tot.pendientes > 0 && (
        <div className="alerta" style={{ marginBottom: 8 }}>
          Hay {fmtNum(tot.pendientes, 2)} h en conduces por aprobar en este periodo. No se están pagando. Apruébalos antes
          de registrar el pago.
        </div>
      )}
      {!periodoTerminado && !pago && (
        <div className="aviso" style={{ marginBottom: 8 }}>
          Esta quincena todavía no termina. Lo de abajo es lo que lleva hasta hoy.
        </div>
      )}

      {dias.map((x) => (
        <button
          key={x.fecha}
          className="card"
          style={{ padding: "8px 12px", minHeight: 0 }}
          onClick={() => !pago && setEditDia(x)}
          disabled={!!pago}
        >
          <div className="row">
            <div>
              <b>
                {nombreDia(x.fecha)} {fmtCorta(x.fecha)}
              </b>
              <div className="line" style={{ margin: 0 }}>
                {etiquetaTipo[x.tipo]}
                {x.feriado ? ` · ${x.feriado}` : ""}
                {x.nota ? ` · ${x.nota}` : ""}
                {x.horasConduce > 0 ? ` · conduce ${fmtNum(x.horasConduce, 2)} h` : ""}
                {x.fueAlCampo ? " · dieta y combustible" : ""}
              </div>
            </div>
            <div className="horas" style={{ fontSize: 20 }}>
              {fmtNum(x.horasPagadas, 2)}
              <small> h</small>
            </div>
          </div>
        </button>
      ))}
      {dias.length === 0 && <div className="empty">No hay días que pagar en este periodo.</div>}
      {!pago && dias.length > 0 && (
        <div className="hint">Toca un día para cambiar sus horas cuando la regla no corresponda.</div>
      )}

      <div className="resumen" style={{ marginTop: 12 }}>
        <div>
          Horas a pagar: <b>{fmtNum(tot.horas, 2)} h</b>
          {perfil.tarifa_hora != null && <> × {dinero(perfil.tarifa_hora)}</>}
        </div>
        <div>
          Ganado: <b>{dinero(pago ? pago.bruto : tot.bruto)}</b>
        </div>
      </div>

      {pago ? (
        <div className="resumen">
          <div>
            <span className="pill disp">Pagado el {fmtCorta(pago.fecha_pago)}</span>
          </div>
          {pago.descuento_deudas > 0 && <div>Descontado por deudas: {dinero(pago.descuento_deudas)}</div>}
          <div>
            Se le pagó: <b>{dinero(pago.neto)}</b>
          </div>
          {pago.nota && <div>{pago.nota}</div>}
          <VoucherDePago
            pagoId={pago.id}
            operadorId={perfil.user_id}
            voucherPath={pago.voucher_path}
            etiqueta={`quincena-${pago.periodo_fin}`}
            onChanged={onChanged}
          />
          <div className="actions">
            <BotonConfirmar texto="Anular este pago" confirmar="Toca otra vez para anular" onClick={anular} disabled={guardando} />
          </div>
        </div>
      ) : (
        <>
          {plan.length > 0 && (
            <div className="resumen">
              <b>Deudas a descontar</b>
              {plan.map((l) => (
                <div className="field" key={l.deuda.id} style={{ marginTop: 8 }}>
                  <label htmlFor={`dd-${l.deuda.id}`}>
                    {l.deuda.concepto} · debe {dinero(l.saldo)}
                    {l.deuda.descuento_por_pago != null ? ` · cuota ${dinero(l.deuda.descuento_por_pago)}` : ""}
                  </label>
                  <input
                    id={`dd-${l.deuda.id}`}
                    inputMode="decimal"
                    value={montos[l.deuda.id] ?? String(l.descuento)}
                    onChange={(e) => setMontos((p) => ({ ...p, [l.deuda.id]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="line">Total descontado: {dinero(totalDescuento)}</div>
            </div>
          )}

          <div className="resumen">
            Se le pagaría: <b>{dinero(neto)}</b>
          </div>

          <div className="grid2">
            <div className="field">
              <label htmlFor="qp-fecha">Fecha del pago</label>
              <input id="qp-fecha" type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="qp-nota">Nota</label>
              <input id="qp-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
            </div>
          </div>
          <CampoVoucher id="qp-voucher" archivo={voucher} onChange={setVoucher} />
          <div className="actions">
            <button
              className="btn primary grow"
              onClick={registrar}
              disabled={guardando || faltaTarifa || faltaDesde || tot.horas <= 0}
            >
              {guardando ? "Registrando..." : "Registrar pago"}
            </button>
          </div>
          <div className="hint">Al registrarlo, el operador ve en su celular que ya se le pagó.</div>
        </>
      )}

      {editDia && (
        <AjusteDia
          userId={perfil.user_id}
          dia={editDia}
          ajuste={d.ajustes.find((a) => a.fecha === editDia.fecha)}
          onClose={() => setEditDia(null)}
          onSaved={() => {
            setEditDia(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// Dieta y combustible semanal (se paga los lunes)
// ---------------------------------------------------------------------------------------------------

function VistaSemana({ d, onChanged }: { d: DatosOperador; onChanged: () => void }) {
  const hoy = hoyRD();
  const { perfil } = d;
  const lunes = Array.from({ length: 6 }, (_, i) => sumarDias(ultimoLunes(hoy), -7 * i)).filter((l) => {
    const s = semanaPagadaEl(l);
    return !perfil.paga_desde || s.fin >= perfil.paga_desde;
  });
  const [valores, setValores] = useState<Record<string, { dieta: string; comb: string }>>({});
  const [vouchers, setVouchers] = useState<Record<string, File | null>>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const ajustesMapa = useMemo(() => mapaAjustes(d.ajustes, d.reportes), [d.ajustes, d.reportes]);

  // Días de campo de cada semana, para calcular la dieta y el combustible
  const campoDe = (l: string) => {
    const s = semanaPagadaEl(l);
    const dias = calcularDias({
      inicio: s.inicio,
      fin: s.fin,
      pagaDesde: perfil.paga_desde,
      hoy,
      conduces: d.conduces,
      feriados: d.feriados,
      ajustes: ajustesMapa,
      trato: perfil,
      tratos: d.tratos,
    });
    return { dias, total: totalCampo(dias) };
  };

  async function registrar(l: string, sugerido: { dieta: number; combustible: number }) {
    setError("");
    const v = valores[l];
    const dieta = v ? aNumero(v.dieta) : sugerido.dieta;
    const comb = v ? aNumero(v.comb) : sugerido.combustible;
    if (dieta == null || dieta < 0 || comb == null || comb < 0) return setError("Escribe la dieta y el combustible (puede ser 0).");
    const s = semanaPagadaEl(l);
    setGuardando(true);
    const supabase = createClient();
    let voucherPath: string | null = null;
    const archivo = vouchers[l];
    if (archivo) {
      try {
        voucherPath = await subirVoucher(archivo, perfil.user_id, `semana-${s.fin}`);
      } catch (ex) {
        setGuardando(false);
        return setError(ex instanceof Error ? ex.message : "No se pudo subir el voucher.");
      }
    }
    const { error: err } = await supabase.from("pagos_operador").insert({
      user_id: perfil.user_id,
      tipo: "semanal",
      periodo_inicio: s.inicio,
      periodo_fin: s.fin,
      fecha_pago: l,
      dieta,
      combustible: comb,
      voucher_path: voucherPath,
      creado_por: await idAdmin(),
    });
    setGuardando(false);
    if (err) {
      if (voucherPath) await supabase.storage.from("conduces").remove([voucherPath]);
      if (err.code === "23505") return setError("Esa semana ya tiene su pago registrado.");
      return setError(`No se pudo registrar: ${err.message}`);
    }
    setVouchers((x) => ({ ...x, [l]: null }));
    onChanged();
  }

  async function anular(id: string) {
    setGuardando(true);
    const { error: err } = await createClient().from("pagos_operador").delete().eq("id", id);
    setGuardando(false);
    if (err) return setError(`No se pudo anular: ${err.message}`);
    onChanged();
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="hint" style={{ marginBottom: 8 }}>
        La dieta y el combustible se pagan por cada día que el operador estuvo presente (con conduce o con reporte de
        día aprobado). Cada lunes se entrega lo de la semana anterior. Los montos y sus cambios se ponen en Operadores
        (hoy: {dinero(perfil.dieta_diaria)} de dieta por día y {dinero(perfil.combustible_diario)} de combustible por{" "}
        {perfil.combustible_por === "semana" ? "semana" : "día"}).
      </div>
      {lunes.length === 0 && <div className="empty">Todavía no hay semanas para pagar.</div>}
      {lunes.map((l) => {
        const s = semanaPagadaEl(l);
        const p = d.pagos.find((x) => x.tipo === "semanal" && x.periodo_inicio === s.inicio);
        const { dias, total } = campoDe(l);
        const v = valores[l] ?? { dieta: String(total.dieta), comb: String(total.combustible) };
        return (
          <div className="card" key={l} style={{ cursor: "default" }}>
            <div className="row">
              <h2 style={{ fontSize: 16 }}>{s.etiqueta}</h2>
              {p && <span className="pill disp">Pagado</span>}
            </div>
            <div className="line">
              Fue al campo {total.dias} {total.dias === 1 ? "día" : "días"}
              {total.dias > 0
                ? `: ${dias
                    .filter((x) => x.fueAlCampo)
                    .map((x) => `${nombreDia(x.fecha).slice(0, 3)} ${fmtCorta(x.fecha)}`)
                    .join(", ")}`
                : ""}
            </div>
            {p ? (
              <>
                <div className="line">
                  Dieta {dinero(p.dieta)} + combustible {dinero(p.combustible)} = <b>{dinero(p.dieta + p.combustible)}</b>
                </div>
                <VoucherDePago
                  pagoId={p.id}
                  operadorId={perfil.user_id}
                  voucherPath={p.voucher_path}
                  etiqueta={`semana-${p.periodo_fin}`}
                  onChanged={onChanged}
                />
                <div className="actions">
                  <BotonConfirmar texto="Anular" confirmar="Toca otra vez para anular" onClick={() => anular(p.id)} disabled={guardando} />
                </div>
              </>
            ) : (
              <>
                <div className="grid2">
                  <div className="field">
                    <label htmlFor={`sd-${l}`}>Dieta</label>
                    <input
                      id={`sd-${l}`}
                      inputMode="decimal"
                      value={v.dieta}
                      onChange={(e) => setValores((x) => ({ ...x, [l]: { ...v, dieta: e.target.value } }))}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`sc-${l}`}>Combustible</label>
                    <input
                      id={`sc-${l}`}
                      inputMode="decimal"
                      value={v.comb}
                      onChange={(e) => setValores((x) => ({ ...x, [l]: { ...v, comb: e.target.value } }))}
                    />
                  </div>
                </div>
                <CampoVoucher
                  id={`sv-${l}`}
                  archivo={vouchers[l] ?? null}
                  onChange={(f) => setVouchers((x) => ({ ...x, [l]: f }))}
                />
                <div className="actions">
                  <button
                    className="btn small primary"
                    onClick={() => registrar(l, { dieta: total.dieta, combustible: total.combustible })}
                    disabled={guardando}
                  >
                    Registrar pago
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// Deudas
// ---------------------------------------------------------------------------------------------------

function VistaDeudas({ d, onChanged }: { d: DatosOperador; onChanged: () => void }) {
  const { perfil } = d;
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(hoyRD());
  const [cuota, setCuota] = useState("");
  const [nota, setNota] = useState("");
  const [abonando, setAbonando] = useState<string | null>(null);
  const [abono, setAbono] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const m = aNumero(monto);
    const c = cuota.trim() === "" ? null : aNumero(cuota);
    if (concepto.trim() === "") return setError("Escribe de qué es la deuda, por ejemplo: préstamo.");
    if (m == null || m <= 0) return setError("Escribe cuánto debe.");
    if (c != null && c <= 0) return setError("La cuota por pago tiene que ser mayor que 0, o déjala vacía para descontar todo.");
    setGuardando(true);
    const { error: err } = await createClient()
      .from("deudas")
      .insert({
        user_id: perfil.user_id,
        concepto: concepto.trim(),
        monto: m,
        fecha,
        descuento_por_pago: c,
        nota: nota.trim() || null,
      });
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    setConcepto("");
    setMonto("");
    setCuota("");
    setNota("");
    onChanged();
  }

  async function registrarAbono(deudaId: string, saldo: number) {
    setError("");
    const m = aNumero(abono);
    if (m == null || m <= 0) return setError("Escribe cuánto pagó.");
    if (m > saldo) return setError(`Solo debe ${dinero(saldo)}.`);
    setGuardando(true);
    const { error: err } = await createClient()
      .from("descuentos_deuda")
      .insert({ deuda_id: deudaId, user_id: perfil.user_id, pago_id: null, monto: m, fecha: hoyRD(), nota: "Abono fuera del pago" });
    setGuardando(false);
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    setAbonando(null);
    setAbono("");
    onChanged();
  }

  async function borrar(id: string) {
    setGuardando(true);
    const { error: err } = await createClient().from("deudas").delete().eq("id", id);
    setGuardando(false);
    if (err) return setError(`No se pudo borrar: ${err.message}`);
    onChanged();
  }

  const totalSaldo = redondear2(d.deudas.reduce((a, x) => a + saldoDeuda(x, d.descuentos), 0));

  return (
    <>
      {error && <div className="error">{error}</div>}
      <div className="resumen">
        Debe en total: <b>{dinero(totalSaldo)}</b>
      </div>

      {d.deudas.map((x) => {
        const saldo = saldoDeuda(x, d.descuentos);
        return (
          <div className="card" key={x.id} style={{ cursor: "default" }}>
            <div className="row">
              <div>
                <h2 style={{ fontSize: 16 }}>{x.concepto}</h2>
                <div className="line" style={{ margin: 0 }}>
                  {fmtCorta(x.fecha)} · {dinero(x.monto)} · acuerdo:{" "}
                  {x.descuento_por_pago != null ? `${dinero(x.descuento_por_pago)} por pago` : "descontar todo en el próximo pago"}
                </div>
              </div>
              <div className="horas" style={{ fontSize: 20 }}>
                {saldo > 0 ? dinero(saldo) : <span className="pill disp">Saldada</span>}
              </div>
            </div>
            {x.nota && <div className="line">{x.nota}</div>}
            {abonando === x.id ? (
              <div className="grid2" style={{ marginTop: 8 }}>
                <div className="field">
                  <label htmlFor={`ab-${x.id}`}>Pagó (fuera de la quincena)</label>
                  <input id={`ab-${x.id}`} inputMode="decimal" value={abono} onChange={(e) => setAbono(e.target.value)} />
                </div>
                <div className="actions" style={{ alignItems: "flex-end" }}>
                  <button className="btn small primary" disabled={guardando} onClick={() => registrarAbono(x.id, saldo)}>
                    Guardar
                  </button>
                  <button className="btn small" onClick={() => setAbonando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="actions">
                {saldo > 0 && (
                  <button className="btn small" onClick={() => setAbonando(x.id)}>
                    Registrar abono
                  </button>
                )}
                <BotonConfirmar texto="Borrar" confirmar="Toca otra vez para borrar" onClick={() => borrar(x.id)} disabled={guardando} />
              </div>
            )}
          </div>
        );
      })}
      {d.deudas.length === 0 && <div className="empty">No tiene deudas.</div>}

      <form className="resumen" onSubmit={agregar} style={{ marginTop: 12 }}>
        <b>Agregar una deuda</b>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="de-con">¿De qué es?</label>
            <input id="de-con" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="de-monto">Cuánto debe (RD$)</label>
            <input id="de-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="de-fecha">Fecha</label>
            <input id="de-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="de-cuota">Descontar por cada pago (RD$)</label>
            <input id="de-cuota" inputMode="decimal" value={cuota} onChange={(e) => setCuota(e.target.value)} />
          </div>
        </div>
        <div className="hint" style={{ marginTop: -6, marginBottom: 8 }}>
          Si dejas el descuento vacío, se descuenta todo en el próximo pago.
        </div>
        <div className="field">
          <label htmlFor="de-nota">Nota</label>
          <input id="de-nota" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div className="actions">
          <button type="submit" className="btn primary" disabled={guardando}>
            Agregar deuda
          </button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
// Pagos hechos
// ---------------------------------------------------------------------------------------------------

function VistaHistorial({ d, onChanged }: { d: DatosOperador; onChanged: () => void }) {
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const pagos = [...d.pagos].sort((a, b) => (a.fecha_pago < b.fecha_pago ? 1 : a.fecha_pago > b.fecha_pago ? -1 : 0));

  async function anular(id: string) {
    setGuardando(true);
    const { error: err } = await createClient().from("pagos_operador").delete().eq("id", id);
    setGuardando(false);
    if (err) return setError(`No se pudo anular: ${err.message}`);
    onChanged();
  }

  return (
    <>
      {error && <div className="error">{error}</div>}
      {pagos.length === 0 && <div className="empty">Todavía no se le ha registrado ningún pago.</div>}
      {pagos.map((p) => (
        <div className="card" key={p.id} style={{ cursor: "default" }}>
          <div className="row">
            <div>
              <h2 style={{ fontSize: 16 }}>
                {p.tipo === "quincena" ? "Quincena" : "Dieta y combustible"} · {fmtCorta(p.periodo_inicio)} al{" "}
                {fmtCorta(p.periodo_fin)}
              </h2>
              <span className="pill disp">Pagado el {fmtCorta(p.fecha_pago)}</span>
            </div>
            <div className="horas" style={{ fontSize: 20 }}>
              {dinero(p.neto)}
            </div>
          </div>
          <div className="line">
            {p.tipo === "quincena"
              ? `${fmtNum(p.horas, 2)} h · ganado ${dinero(p.bruto)}${p.descuento_deudas > 0 ? ` · deudas −${dinero(p.descuento_deudas)}` : ""}`
              : `Dieta ${dinero(p.dieta)} + combustible ${dinero(p.combustible)}`}
          </div>
          <VoucherDePago
            pagoId={p.id}
            operadorId={p.user_id}
            voucherPath={p.voucher_path}
            etiqueta={`${p.tipo === "quincena" ? "quincena" : "semana"}-${p.periodo_fin}`}
            onChanged={onChanged}
          />
          <div className="actions">
            <BotonConfirmar texto="Anular" confirmar="Toca otra vez para anular" onClick={() => anular(p.id)} disabled={guardando} />
          </div>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------

export default function PagoOperador({
  datos,
  onVolver,
  onChanged,
}: {
  datos: DatosOperador;
  onVolver: () => void;
  onChanged: () => void;
}) {
  const [vista, setVista] = useState<Vista>("quincena");
  const boton = (v: Vista, texto: string) => (
    <button className={vista === v ? "tab on" : "tab"} onClick={() => setVista(v)}>
      {texto}
    </button>
  );
  return (
    <>
      <div className="top">
        <h1>{datos.perfil.nombre || "Operador"}</h1>
        <button className="btn" onClick={onVolver}>
          ← Todos
        </button>
      </div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {boton("quincena", "Quincena")}
        {boton("semana", "Dieta y combustible")}
        {boton("deudas", "Deudas")}
        {boton("historial", "Pagos hechos")}
      </div>
      {vista === "quincena" && <VistaQuincena key={datos.perfil.user_id} d={datos} onChanged={onChanged} />}
      {vista === "semana" && <VistaSemana key={datos.perfil.user_id} d={datos} onChanged={onChanged} />}
      {vista === "deudas" && <VistaDeudas d={datos} onChanged={onChanged} />}
      {vista === "historial" && <VistaHistorial d={datos} onChanged={onChanged} />}
    </>
  );
}
