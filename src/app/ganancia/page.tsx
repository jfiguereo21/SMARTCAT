"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import FondoEditor from "@/components/FondoEditor";
import { useSociosFondo } from "@/lib/useSociosFondo";
import { CAT_PRESTAMO } from "@/lib/fondo";
import { fmtMonto, fmtNum, hoyRD, type Acuerdo, type Machine } from "@/lib/machines";
import { corteDe } from "@/lib/conduces";
import type { PreciosCorte } from "@/lib/combustible";
import type { CargaCorte } from "@/lib/corte";
import { aAjusteRow, aPerfilPago, aReporteDiaRow, aTratoRow, type PerfilPago } from "@/lib/pagos";
import { costoDiasOperador, type CostoDia } from "@/lib/trabajos";
import { aParte, aTrabajo, type Parte, type Trabajo } from "@/lib/trabajos";
import { calcularGanancia, type ConduceGanancia, type GastoFondo, type GananciaMaquina, type PrestamoSociedad } from "@/lib/ganancia";

const rd = (n: number) => fmtMonto(n, "DOP");
const colorGanancia = (n: number) => (n < 0 ? "var(--danger)" : "var(--ok)");

function Linea({ texto, valor, resta = true, nota }: { texto: string; valor: number; resta?: boolean; nota?: string }) {
  if (valor === 0) return null;
  return (
    <div className="line" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span>
        {resta ? "− " : ""}
        {texto}
        {nota ? <span style={{ color: "var(--taller)" }}> {nota}</span> : null}
      </span>
      <span>{rd(valor)}</span>
    </div>
  );
}

type DatosTarjeta = Pick<
  GananciaMaquina,
  | "horas" | "ingreso" | "operadorHoras" | "operadorCampo" | "combustible" | "dueno" | "gastos" | "gastosPorAprobar"
  | "costo" | "ganancia" | "porcentaje" | "cuota" | "cuotaNota" | "tienePrestamo" | "gananciaFinal" | "porcentajeFinal"
  | "costoCompra" | "pctCosto" | "avisos" | "seguro" | "cuotaRegistrada" | "compraPendiente" | "prestamosSociedad" | "comision" | "comisionPct" | "piscinas"
>;

function Tarjeta({ m, titulo, onCuota }: { m: DatosTarjeta; titulo: string; onCuota?: () => void }) {
  return (
    <div className="resumen">
      <div className="row">
        <h2 style={{ fontSize: 18, margin: 0 }}>{titulo}</h2>
        <span className="line" style={{ margin: 0 }}>
          {fmtNum(m.horas, 2)} h
        </span>
      </div>
      <div style={{ margin: "8px 0 4px", fontSize: 22, fontWeight: 800, color: colorGanancia(m.ganancia) }}>
        {m.tienePrestamo ? (m.ganancia < 0 ? "Pérdida de operar " : "Ganancia de operar ") : m.ganancia < 0 ? "Pérdida " : "Ganancia "}
        {rd(Math.abs(m.ganancia))}
        {m.porcentaje != null && <span style={{ fontSize: 15, fontWeight: 600 }}> · {fmtNum(m.porcentaje, 1)}%</span>}
      </div>
      <Linea texto="Cobrado al cliente (sin el combustible que dio el cliente)" valor={m.ingreso} resta={false} />
      <Linea texto="Operador: horas" valor={m.operadorHoras} />
      <Linea texto="Operador: dieta y combustible" valor={m.operadorCampo} />
      <Linea texto="Combustible de la máquina" valor={m.combustible} />
      <Linea texto="Seguro de la máquina (1/12 de la prima)" valor={m.seguro} />
      {m.comision > 0 && (
        <Linea texto={m.comisionPct != null && m.comisionPct > 0 ? `Comisión (${fmtNum(m.comisionPct, 2)}% de lo cobrado)` : "Comisión sobre lo cobrado"} valor={m.comision} />
      )}
      <Linea texto="Pago al dueño de la máquina" valor={m.dueno} />
      {m.prestamosSociedad > 0 && <Linea texto="Cuotas de los préstamos de Francisco" valor={m.prestamosSociedad} />}
      <Linea
        texto="Gastos del Fondo (reparaciones, repuestos...)"
        valor={m.gastos}
        nota={m.gastosPorAprobar > 0 ? `incluye ${rd(m.gastosPorAprobar)} por aprobar` : undefined}
      />
      <div className="line" style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Total de gastos</span>
        <span>{rd(m.costo)}</span>
      </div>
      <div className="line" style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: colorGanancia(m.ganancia) }}>
        <span>{m.tienePrestamo ? "Ganancia de operar (cobrado − gastos)" : "Ganancia (cobrado − gastos)"}</span>
        <span>{m.ganancia < 0 ? "−" : ""}{rd(Math.abs(m.ganancia))}</span>
      </div>
      {m.tienePrestamo && (
        <>
          <div className="line" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span>− Cuota del préstamo{m.cuotaNota ? ` (${m.cuotaNota})` : m.cuota > 0 ? "" : " (no cae en este corte)"}</span>
            <span>{rd(m.cuota)}</span>
          </div>
          <div className="line" style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, color: colorGanancia(m.gananciaFinal) }}>
            <span>Te queda después del préstamo</span>
            <span>
              {m.gananciaFinal < 0 ? "−" : ""}
              {rd(Math.abs(m.gananciaFinal))}
              {m.porcentajeFinal != null ? ` · ${fmtNum(m.porcentajeFinal, 1)}%` : ""}
            </span>
          </div>
        </>
      )}
      {m.piscinas && (
        <div className="line">
          Piscinas (precio cerrado): {m.piscinas.terminadas} terminada{m.piscinas.terminadas === 1 ? "" : "s"} en este corte,{" "}
          {rd(m.piscinas.ingreso)} ya sumados en lo cobrado.
          {m.piscinas.porCobrar > 0 ? ` Faltan por terminar ${rd(m.piscinas.porCobrar)}.` : ""}
        </div>
      )}
      {m.tienePrestamo && m.cuota > 0 && onCuota && (
        m.cuotaRegistrada ? (
          <div className="line" style={{ color: "var(--ok)" }}>✓ La cuota ya está anotada en el Fondo.</div>
        ) : (
          <button type="button" className="btn" style={{ width: "100%", marginTop: 8 }} onClick={onCuota}>
            Registrar el pago de la cuota
          </button>
        )
      )}
      {m.compraPendiente && (
        <div className="line">
          Falta por pagar de la compra: {fmtMonto(m.compraPendiente.monto, m.compraPendiente.moneda)} (a la entrega).
        </div>
      )}
      {m.costoCompra && (
        <div className="line">
          Costó {fmtMonto(m.costoCompra.monto, m.costoCompra.moneda)}
          {m.pctCosto != null ? `. Operar la máquina dejó este corte el ${fmtNum(m.pctCosto, 1)}% de ese costo.` : "."}
        </div>
      )}
      {m.avisos.map((a) => (
        <div className="alerta" key={a}>
          {a}
        </div>
      ))}
    </div>
  );
}

export default function GananciaPage() {
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [conduces, setConduces] = useState<ConduceGanancia[]>([]);
  const [cargas, setCargas] = useState<CargaCorte[]>([]);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [precios, setPrecios] = useState<PreciosCorte[]>([]);
  const [operadores, setOperadores] = useState<Map<string, Map<string, CostoDia>>>(new Map());
  const [fondo, setFondo] = useState<GastoFondo[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoSociedad[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [sinFondo, setSinFondo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [claveSel, setClaveSel] = useState<string | null>(null);
  const { socios, uid } = useSociosFondo();
  const [editor, setEditor] = useState<{ categoria: string; machineId: string; monto: string; descripcion: string } | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const hoy = hoyRD();
    const [m, c, f, a, p, pr, tb, tp, pf, tr, aj, rp, fe, fo] = await Promise.all([
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables, estado, creado_por, parte_id").neq("estado", "Rechazado"),
      supabase.from("fuel_logs").select("machine_id, fecha, galones, origen, estado, monto, moneda"),
      supabase.from("acuerdos").select("*, machines(nombre), clients(nombre)"),
      supabase.from("corte_precios").select("*"),
      supabase.from("prestamos_sociedad").select("*"),
      supabase.from("trabajos").select("*"),
      supabase.from("trabajo_partes").select("*"),
      supabase
        .from("perfiles")
        .select("user_id, nombre, activo, tarifa_hora, paga_desde, dieta_diaria, combustible_diario, combustible_por, horas_alojamiento, horas_sin_conduce, minimo_horas_dia, minimo_horas_sabado, dieta_siempre")
        .eq("rol", "operador"),
      supabase.from("tratos_operador").select("*"),
      supabase.from("dias_operador").select("*"),
      supabase.from("reportes_dia").select("*"),
      supabase.from("feriados").select("fecha, nombre"),
      supabase.from("fondo_movimientos").select("fecha, tipo, categoria, monto, machine_id, rechazado_en, aprobado_en"),
    ]);
    const fallo = m.error ?? c.error ?? f.error ?? a.error ?? p.error ?? pr.error ?? tb.error ?? tp.error ?? pf.error ?? tr.error ?? aj.error ?? rp.error ?? fe.error;
    if (fallo) {
      setError(`No se pudieron cargar los datos: ${fallo.message}`);
      setCargando(false);
      return;
    }
    setError("");
    setMaquinas(
      ((m.data ?? []) as Machine[]).map((x) => ({
        ...x,
        pago_dueno: x.pago_dueno == null ? null : Number(x.pago_dueno),
        costo_compra: x.costo_compra == null ? null : Number(x.costo_compra),
        compra_pendiente: x.compra_pendiente == null ? null : Number(x.compra_pendiente),
        seguro_prima_anual: x.seguro_prima_anual == null ? null : Number(x.seguro_prima_anual),
        prestamo_cuota: x.prestamo_cuota == null ? null : Number(x.prestamo_cuota),
      }))
    );
    const filas: ConduceGanancia[] = (c.data ?? []).map((x: Record<string, unknown>) => ({
      machine_id: String(x.machine_id),
      fecha: String(x.fecha),
      horas_cobrables: Number(x.horas_cobrables),
      estado: String(x.estado),
      creado_por: (x.creado_por as string | null) ?? null,
      parte_id: (x.parte_id as string | null) ?? null,
    }));
    setConduces(filas);
    setCargas(
      ((f.data ?? []) as CargaCorte[]).map((x) => ({
        ...x,
        galones: Number(x.galones),
        monto: x.monto == null ? null : Number(x.monto),
      }))
    );
    setAcuerdos(((a.data ?? []) as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
    setPrecios(
      ((p.data ?? []) as PreciosCorte[]).map((x) => ({
        corte: x.corte,
        precio_diesel_dop: Number(x.precio_diesel_dop),
        tasa_dolar: Number(x.tasa_dolar),
      }))
    );

    setPrestamos(
      ((pr.data ?? []) as PrestamoSociedad[]).map((x) => ({ ...x, cuota: Number(x.cuota) }))
    );

    setTrabajos((tb.data ?? []).map(aTrabajo));
    setPartes((tp.data ?? []).map(aParte));

    const feriados: Record<string, string> = {};
    (fe.data ?? []).forEach((x: { fecha: string; nombre: string }) => (feriados[x.fecha] = x.nombre));
    const perfiles: PerfilPago[] = (pf.data ?? []).map(aPerfilPago);
    const tratos = (tr.data ?? []).map(aTratoRow);
    const ajustes = (aj.data ?? []).map(aAjusteRow);
    const reportes = (rp.data ?? []).map(aReporteDiaRow);
    const ops = new Map<string, Map<string, CostoDia>>();
    for (const perfil of perfiles) {
      ops.set(
        perfil.user_id,
        costoDiasOperador(
          {
            perfil,
            tratos: tratos.filter((x) => x.user_id === perfil.user_id),
            ajustes: ajustes.filter((x) => x.user_id === perfil.user_id),
            reportes: reportes.filter((x) => x.user_id === perfil.user_id),
            conduces: filas
              .filter((x) => x.creado_por === perfil.user_id)
              .map((x) => ({ fecha: x.fecha, horas: x.horas_cobrables, aprobado: x.estado === "Aprobado" })),
          },
          feriados,
          hoy
        )
      );
    }
    setOperadores(ops);

    if (fo.error) {
      setSinFondo(true);
      setFondo([]);
    } else {
      setSinFondo(false);
      setFondo(
        (fo.data ?? []).map((x: Record<string, unknown>) => ({
          fecha: String(x.fecha),
          tipo: String(x.tipo),
          categoria: String(x.categoria),
          monto: Number(x.monto),
          machine_id: (x.machine_id as string | null) ?? null,
          rechazado: x.rechazado_en != null,
          aprobado: x.aprobado_en != null,
        }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cortes = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const x of conduces) {
      const k = corteDe(x.fecha);
      mapa.set(k.clave, k.etiqueta);
    }
    const h = corteDe(hoyRD());
    mapa.set(h.clave, h.etiqueta);
    return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([clave, etiqueta]) => ({ clave, etiqueta }));
  }, [conduces]);

  const clave = claveSel ?? corteDe(hoyRD()).clave;
  const precio = precios.find((p) => p.corte === clave) ?? null;
  const r = useMemo(
    () => calcularGanancia({ clave, maquinas, conduces, cargas, acuerdos, precio, operadores, fondo, prestamos, trabajos, partes }),
    [clave, maquinas, conduces, cargas, acuerdos, precio, operadores, fondo, prestamos, trabajos, partes]
  );

  return (
    <main className="wrap">
      <Nav activa="corte" />
      <div className="top">
        <h1>Ganancia por máquina</h1>
        <Link href="/corte" className="btn">
          Volver a Corte
        </Link>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="ga-corte">Corte</label>
        <select id="ga-corte" value={clave} onChange={(e) => setClaveSel(e.target.value)}>
          {cortes.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.etiqueta}
            </option>
          ))}
        </select>
        <div className="hint">
          Todo en pesos. Lo cobrado en dólares se pasa con la tasa del día 25. Solo cuentan los conduces aprobados.
        </div>
      </div>

      {sinFondo && (
        <div className="alerta" style={{ marginBottom: 8 }}>
          No pude leer los gastos del Fondo, así que no están contados.
        </div>
      )}
      {r.maquinas.some((m) => m.avisos.some((a) => a.includes("tasa del dólar"))) && (
        <div className="alerta" style={{ marginBottom: 8 }}>
          Falta la tasa del dólar de este corte. Ponla en <Link href="/corte">Corte</Link> para que cuente lo cobrado en dólares.
        </div>
      )}

      {cargando ? (
        <div className="empty">Cargando...</div>
      ) : r.maquinas.length === 0 ? (
        <div className="empty">No hay horas aprobadas en este corte todavía.</div>
      ) : (
        <>
          {r.grupos.map((g) => (
            <div key={g.nombre}>
              <h2 style={{ fontSize: 20, margin: "18px 0 8px" }}>{g.nombre}</h2>
              {g.maquinas.map((m) => (
                <Tarjeta
                  key={m.machineId}
                  m={m}
                  titulo={m.maquina}
                  onCuota={() =>
                    setEditor({
                      categoria: CAT_PRESTAMO,
                      machineId: m.machineId,
                      monto: String(m.cuota),
                      descripcion: `Cuota${m.cuotaNota ? ` ${m.cuotaNota.replace("cuota ", "")}` : ""} del préstamo de ${m.maquina}`,
                    })
                  }
                />
              ))}
              <Tarjeta m={g.total} titulo={g.nombre === "Otros clientes" ? "Total otros clientes" : `Total ${g.nombre}`} />
            </div>
          ))}
          <div className="resumen">
            <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>Resumen total</h2>
            {r.grupos.map((g) => (
              <div className="line" key={g.nombre} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>Ganancia de operar · {g.nombre}</span>
                <span>{rd(g.total.ganancia)}</span>
              </div>
            ))}
            {r.prestamos.monto > 0 && (
              <div className="line" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>− Cuotas de los préstamos de Francisco</span>
                <span>{rd(r.prestamos.monto)}</span>
              </div>
            )}
            <div style={{ margin: "8px 0", fontSize: 20, fontWeight: 800, color: colorGanancia(r.total.ganancia) }}>
              Ganancia de operar total {r.total.ganancia < 0 ? "−" : ""}
              {rd(Math.abs(r.total.ganancia))}
              {r.total.porcentaje != null && <span style={{ fontSize: 15, fontWeight: 600 }}> · {fmtNum(r.total.porcentaje, 1)}%</span>}
            </div>
            {r.total.cuota > 0 && (
              <div className="line" style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>− Cuota del préstamo de la Hyundai</span>
                <span>{rd(r.total.cuota)}</span>
              </div>
            )}
            <div style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 800, color: colorGanancia(r.total.gananciaFinal) }}>
              Te queda {r.total.gananciaFinal < 0 ? "−" : ""}
              {rd(Math.abs(r.total.gananciaFinal))}
              {r.total.porcentajeFinal != null && <span style={{ fontSize: 15, fontWeight: 600 }}> · {fmtNum(r.total.porcentajeFinal, 1)}%</span>}
            </div>
            {r.total.avisos.map((a) => (
              <div className="alerta" key={a}>
                {a}
              </div>
            ))}
          </div>
          <div className="resumen">
            <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Financiamiento de la sociedad</h2>
            <div className="hint" style={{ marginBottom: 8 }}>
              Los préstamos personales de Francisco (APAP y el préstamo a cuotas) se cuentan solos cada corte, con su cuota fija.
            </div>
            {prestamos.map((x) => (
              <div className="line" key={x.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span>{x.nombre}</span>
                <span>{fmtMonto(Number(x.cuota), x.moneda)}</span>
              </div>
            ))}
            <div className="line" style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700 }}>
              <span>Cuotas de este corte (ya suman como gasto)</span>
              <span>{rd(r.prestamos.monto)}</span>
            </div>
            <div className="hint">
              Anotadas en el Fondo: {rd(r.prestamos.registrado)}. Si anotas el pago aquí abajo, no se cuenta dos veces.
            </div>
            <button
              type="button"
              className="btn"
              style={{ width: "100%", marginTop: 8 }}
              onClick={() => setEditor({ categoria: CAT_PRESTAMO, machineId: "", monto: "", descripcion: "Cuota de préstamo personal" })}
            >
              Anotar de dónde salió el pago de una cuota
            </button>
          </div>
          {(r.sinMaquina.operador > 0 || r.sinMaquina.gastos > 0) && (
            <div className="aviso" style={{ marginBottom: 12 }}>
              Aparte, sin máquina asignada: {r.sinMaquina.gastos > 0 ? `gastos del Fondo ${rd(r.sinMaquina.gastos)}` : ""}
              {r.sinMaquina.gastos > 0 && r.sinMaquina.operador > 0 ? " y " : ""}
              {r.sinMaquina.operador > 0 ? `pago de operadores ${rd(r.sinMaquina.operador)}` : ""}. No están restados de ninguna máquina.
              Márcalos con su máquina en el Fondo para que cuenten.
            </div>
          )}
          <div className="hint" style={{ marginBottom: 24 }}>
            Cuenta: cobrado al cliente menos pago del operador (horas, dieta y combustible), combustible de la máquina, pago al dueño
            y gastos del Fondo con máquina. Un día con la máquina dañada se carga a la máquina de ese operador. No incluye depreciación. La cuota del préstamo se resta aparte, para que veas cuánto rinde la máquina y cuánto te queda. Las piscinas (precio cerrado) cuentan cuando se terminan.
          </div>
        </>
      )}
      {editor && uid && (
        <FondoEditor
          mov={null}
          maquinas={maquinas}
          socios={socios}
          uid={uid}
          inicial={editor}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            cargar();
          }}
        />
      )}
    </main>
  );
}
