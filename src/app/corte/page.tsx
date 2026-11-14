"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { acuerdoVigente, fmtMonto, fmtNum, hoyRD, type Acuerdo, type Machine } from "@/lib/machines";
import { corteDe, fmtFecha } from "@/lib/conduces";
import type { PreciosCorte } from "@/lib/combustible";
import { armarCorte, claveCorte, pagoDuenos, type CargaCorte, type ConduceCorte } from "@/lib/corte";
import { construirExcelCorte, type DetalleDia } from "@/lib/corteExcel";
import { aParte, aTrabajo, type Parte, type Trabajo } from "@/lib/trabajos";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function CortePage() {
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [conduces, setConduces] = useState<ConduceCorte[]>([]);
  const [cargas, setCargas] = useState<CargaCorte[]>([]);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [precios, setPrecios] = useState<PreciosCorte[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [claveSel, setClaveSel] = useState<string | null>(null);
  const [bajando, setBajando] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [m, c, f, a, p, tj, pt] = await Promise.all([
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables, estado, parte_id").neq("estado", "Rechazado"),
      supabase.from("fuel_logs").select("machine_id, fecha, galones, origen, estado, monto, moneda"),
      supabase.from("acuerdos").select("*, machines(nombre), clients(nombre)"),
      supabase.from("corte_precios").select("*"),
      supabase.from("trabajos").select("*"),
      supabase.from("trabajo_partes").select("*").order("orden"),
    ]);
    const fallo = m.error ?? c.error ?? f.error ?? a.error ?? p.error ?? tj.error ?? pt.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setMaquinas((m.data ?? []) as Machine[]);
      setConduces(((c.data ?? []) as ConduceCorte[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) })));
      setCargas(
        ((f.data ?? []) as CargaCorte[]).map((x) => ({
          ...x,
          galones: Number(x.galones),
          monto: x.monto == null ? null : Number(x.monto),
        }))
      );
      setAcuerdos(((a.data ?? []) as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
      setTrabajos((tj.data ?? []).map(aTrabajo));
      setPartes((pt.data ?? []).map(aParte));
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

  const cortes = useMemo(() => {
    const mapa = new Map<string, string>();
    const sumar = (fecha: string) => {
      const k = corteDe(fecha);
      mapa.set(k.clave, k.etiqueta);
    };
    conduces.forEach((x) => sumar(x.fecha));
    sumar(hoyRD());
    return [...mapa.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([clave, etiqueta]) => ({ clave, etiqueta }));
  }, [conduces]);

  const clave = claveSel ?? corteDe(hoyRD()).clave;
  const etiqueta = cortes.find((c) => c.clave === clave)?.etiqueta ?? corteDe(hoyRD()).etiqueta;
  const precio = precios.find((p) => p.corte === clave) ?? null;
  // Las horas que están en una piscina de un trabajo a precio cerrado no se cobran por hora.
  const conducesPorHora = useMemo(() => conduces.filter((c) => !c.parte_id), [conduces]);
  const corte = useMemo(
    () => armarCorte(clave, maquinas, conducesPorHora, cargas, acuerdos, precio),
    [clave, maquinas, conducesPorHora, cargas, acuerdos, precio]
  );
  // Piscinas terminadas dentro de este corte: eso es lo que se cobra ahora.
  const terminadasCorte = useMemo(
    () => partes.filter((p) => p.terminada_en && corteDe(p.terminada_en).clave === clave),
    [partes, clave]
  );
  const duenos = useMemo(
    () => pagoDuenos(clave, maquinas, conduces, cargas, precio),
    [clave, maquinas, conduces, cargas, precio]
  );
  const hayDatos = corte.grupos.length > 0 || corte.horasSinAcuerdo.length > 0 || terminadasCorte.length > 0;

  async function descargar() {
    setBajando(true);
    try {
      const detalle: DetalleDia[] = [];
      for (const c of conducesPorHora
        .filter(
          (x) =>
            x.estado === "Aprobado" && claveCorte(x.fecha, acuerdoVigente(acuerdos, x.machine_id, x.fecha)) === clave
        )
        .sort((a, b) => (a.fecha < b.fecha ? -1 : 1))) {
        const a = acuerdoVigente(acuerdos, c.machine_id, c.fecha);
        if (!a) continue;
        detalle.push({
          fecha: c.fecha,
          maquina: maquinas.find((m) => m.id === c.machine_id)?.nombre ?? "Máquina",
          horas: c.horas_cobrables,
          tarifa: a.tarifa,
          moneda: a.moneda,
          importe: Math.round(c.horas_cobrables * a.tarifa * 100) / 100,
        });
      }
      const buf = await construirExcelCorte({ etiqueta, corte, detalle, duenos });
      const url = URL.createObjectURL(new Blob([buf], { type: XLSX_MIME }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Corte ${clave}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(`No se pudo armar el Excel: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBajando(false);
  }

  return (
    <main className="wrap">
      <Nav activa="corte" />
      <div className="top">
        <h1>Corte</h1>
        <button className="btn primary" onClick={descargar} disabled={!hayDatos || bajando}>
          {bajando ? "Armando..." : "Descargar Excel"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="co-corte">Corte</label>
        <select id="co-corte" value={clave} onChange={(e) => setClaveSel(e.target.value)}>
          {cortes.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.etiqueta}
            </option>
          ))}
        </select>
        <div className="hint">Solo cuentan los conduces aprobados.</div>
      </div>

      {corte.pendientes > 0 && (
        <div className="alerta" style={{ marginBottom: 8 }}>
          Hay {corte.pendientes} conduce(s) sin aprobar en este corte. No están contados: apruébalos en Conduces.
        </div>
      )}
      {corte.horasSinAcuerdo.map((h) => (
        <div className="alerta" style={{ marginBottom: 8 }} key={h.machineId}>
          <b>{h.maquina}:</b> {fmtNum(h.horas, 2)} h sin acuerdo de tarifa vigente. No se pueden cobrar hasta crear el acuerdo en{" "}
          <Link href="/acuerdos">Acuerdos</Link>.
        </div>
      ))}
      {corte.faltaPrecio && (
        <div className="alerta" style={{ marginBottom: 8 }}>
          Falta el precio del diésel y el dólar del día 25 para descontar el combustible del cliente. Ponlos en{" "}
          <Link href="/combustible">Combustible</Link>.
        </div>
      )}
      {corte.galonesSinAcuerdo > 0 && (
        <div className="alerta" style={{ marginBottom: 8 }}>
          {fmtNum(corte.galonesSinAcuerdo, 2)} galones del cliente no se pudieron asignar a ningún acuerdo.
        </div>
      )}

      {cargando ? (
        <div className="empty">Cargando...</div>
      ) : !hayDatos ? (
        <div className="empty">No hay horas aprobadas en este corte todavía.</div>
      ) : (
        corte.grupos.map((g) => (
          <div className="resumen" key={g.clienteId ?? "sin"}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{g.cliente}</h2>
            {g.lineas.map((l) => (
              <div key={l.acuerdoId} style={{ marginBottom: 10 }}>
                <b>{l.maquina}</b>
                {l.obra ? ` · ${l.obra}` : ""}
                <div className="line">
                  {fmtNum(l.horas, 2)} h × {fmtMonto(l.tarifa, l.moneda)} = <b>{fmtMonto(l.bruto, l.moneda)}</b>
                </div>
                {l.galonesCliente > 0 && (
                  <div className="line">
                    Combustible del cliente: {fmtNum(l.galonesCliente, 2)} gal{" "}
                    {l.descuento != null ? (
                      <>
                        = −{fmtMonto(l.descuento, l.moneda)} → <b>{fmtMonto(l.neto ?? 0, l.moneda)}</b>
                      </>
                    ) : (
                      "(falta el precio del día 25)"
                    )}
                  </div>
                )}
              </div>
            ))}
            {g.totales.map((t) => (
              <div className="total-h" style={{ fontSize: 20 }} key={t.moneda}>
                Total a cobrar: {fmtMonto(t.neto, t.moneda)}
                {!t.completo && <span className="aviso"> (incompleto)</span>}
              </div>
            ))}
          </div>
        ))
      )}

      {!cargando && terminadasCorte.length > 0 && (
        <div className="resumen">
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Trabajos a precio cerrado</h2>
          {trabajos
            .filter((t) => terminadasCorte.some((p) => p.trabajo_id === t.id))
            .map((t) => {
              const ps = terminadasCorte.filter((p) => p.trabajo_id === t.id);
              return (
                <div key={t.id} style={{ marginBottom: 12 }}>
                  <b>{t.nombre}</b>
                  {ps.map((p) => (
                    <div className="line" key={p.id}>
                      {p.nombre} · terminada el {fmtFecha(p.terminada_en!)} · {fmtMonto(p.precio, "DOP")}
                    </div>
                  ))}
                  <div className="total-h" style={{ fontSize: 20 }}>
                    Total a cobrar: {fmtMonto(ps.reduce((a, p) => a + p.precio, 0), "DOP")}
                  </div>
                </div>
              );
            })}
          <div className="hint">
            Estas horas no se cobran por hora. La ganancia de cada piscina está en <Link href="/trabajos">Trabajos</Link>.
          </div>
        </div>
      )}

      {!cargando && duenos.length > 0 && (
        <div className="resumen">
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Pago a dueños de máquinas</h2>
          {duenos.map((d) => (
            <div key={d.machineId} style={{ marginBottom: 12 }}>
              <b>{d.maquina}</b>
              {d.dueno ? ` · ${d.dueno}` : ""}
              <div className="line">
                {fmtNum(d.horas, 2)} h × {fmtMonto(d.pagoHora, "DOP")} = <b>{fmtMonto(d.bruto, "DOP")}</b>
              </div>
              {d.descuentaCombustible && (d.galonesCliente > 0 || d.galonesPropios > 0) && (
                <>
                  {d.galonesCliente > 0 && (
                    <div className="line">
                      Combustible del cliente: {fmtNum(d.galonesCliente, 2)} gal
                      {d.descuentoCliente != null ? ` = −${fmtMonto(d.descuentoCliente, "DOP")}` : " (falta el precio del día 25)"}
                    </div>
                  )}
                  {d.galonesPropios > 0 && (
                    <div className="line">
                      Combustible comprado por ti: {fmtNum(d.galonesPropios, 2)} gal
                      {d.descuentoPropio != null ? ` = −${fmtMonto(d.descuentoPropio, "DOP")}` : " (falta el precio de esa carga)"}
                    </div>
                  )}
                </>
              )}
              {d.neto != null ? (
                <div className="total-h" style={{ fontSize: 20 }}>
                  {d.descuentaCombustible ? "Pago neto al dueño" : "Pago al dueño"}: {fmtMonto(d.neto, "DOP")}
                </div>
              ) : (
                <div className="aviso">Incompleto: falta un precio para calcular el descuento.</div>
              )}
              {!d.descuentaCombustible && <div className="hint">Esta máquina no tiene marcado descontar combustible.</div>}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
