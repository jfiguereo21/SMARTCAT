"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import PagoOperador, { type DatosOperador } from "@/components/PagoOperador";
import { fmtMonto, fmtNum, hoyRD } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import {
  aAjusteRow,
  aDeudaRow,
  aDescuentoRow,
  aPagoRow,
  aPerfilPago,
  calcularDias,
  fmtCorta,
  quincenaDe,
  redondear2,
  saldoDeuda,
  totalizar,
  type AjusteRow,
  type DescuentoRow,
  type DeudaRow,
  type PagoRow,
  type PerfilPago,
} from "@/lib/pagos";

type ConduceFila = { creado_por: string | null; fecha: string; horas_cobrables: number; estado: string };
type Feriado = { fecha: string; nombre: string };

function Feriados({ feriados, onChanged }: { feriados: Feriado[]; onChanged: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const hoy = hoyRD();
  const proximos = feriados.filter((f) => f.fecha >= hoy);

  async function agregar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!fecha || nombre.trim() === "") return setError("Pon la fecha y el nombre del festivo.");
    const { error: err } = await createClient().from("feriados").upsert({ fecha, nombre: nombre.trim() });
    if (err) return setError(`No se pudo guardar: ${err.message}`);
    setFecha("");
    setNombre("");
    onChanged();
  }

  async function quitar(f: string) {
    const { error: err } = await createClient().from("feriados").delete().eq("fecha", f);
    if (err) return setError(`No se pudo quitar: ${err.message}`);
    onChanged();
  }

  return (
    <div className="resumen" style={{ marginTop: 16 }}>
      <button className="btn small" onClick={() => setAbierto(!abierto)}>
        {abierto ? "Ocultar días festivos" : `Días festivos (${proximos.length} próximos)`}
      </button>
      {abierto && (
        <>
          <div className="hint" style={{ marginTop: 8 }}>
            Los festivos no se pagan, salvo que pidan la máquina (entonces se paga el doble). Pon aquí la fecha en que
            realmente se celebra, incluso si el festivo se movió.
          </div>
          {error && <div className="error">{error}</div>}
          {proximos.map((f) => (
            <div className="row" key={f.fecha} style={{ marginTop: 6 }}>
              <span>
                {fmtFecha(f.fecha)} · {f.nombre}
              </span>
              <button className="btn small danger" onClick={() => quitar(f.fecha)}>
                Quitar
              </button>
            </div>
          ))}
          <form onSubmit={agregar} className="grid2" style={{ marginTop: 10 }}>
            <div className="field">
              <label htmlFor="fe-fecha">Fecha</label>
              <input id="fe-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="fe-nombre">Nombre</label>
              <input id="fe-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="actions">
              <button className="btn small primary" type="submit">
                Agregar festivo
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default function PagosPage() {
  const [perfiles, setPerfiles] = useState<PerfilPago[]>([]);
  const [conduces, setConduces] = useState<ConduceFila[]>([]);
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [ajustes, setAjustes] = useState<AjusteRow[]>([]);
  const [deudas, setDeudas] = useState<DeudaRow[]>([]);
  const [descuentos, setDescuentos] = useState<DescuentoRow[]>([]);
  const [pagos, setPagos] = useState<PagoRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [p, c, f, a, d, ds, pg] = await Promise.all([
      supabase
        .from("perfiles")
        .select("user_id, nombre, activo, tarifa_hora, paga_desde, dieta_semanal, combustible_semanal")
        .eq("rol", "operador")
        .order("nombre"),
      supabase.from("conduces").select("creado_por, fecha, horas_cobrables, estado").in("estado", ["Aprobado", "Pendiente"]),
      supabase.from("feriados").select("fecha, nombre").order("fecha"),
      supabase.from("dias_operador").select("*"),
      supabase.from("deudas").select("*").order("fecha"),
      supabase.from("descuentos_deuda").select("*"),
      supabase.from("pagos_operador").select("*"),
    ]);
    const fallo = p.error ?? c.error ?? f.error ?? a.error ?? d.error ?? ds.error ?? pg.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setPerfiles((p.data ?? []).map(aPerfilPago));
      setConduces(
        ((c.data ?? []) as ConduceFila[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) }))
      );
      setFeriados((f.data ?? []) as Feriado[]);
      setAjustes((a.data ?? []).map(aAjusteRow));
      setDeudas((d.data ?? []).map(aDeudaRow));
      setDescuentos((ds.data ?? []).map(aDescuentoRow));
      setPagos((pg.data ?? []).map(aPagoRow));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const feriadosMapa = useMemo(() => {
    const m: Record<string, string> = {};
    feriados.forEach((f) => (m[f.fecha] = f.nombre));
    return m;
  }, [feriados]);

  const datosDe = useCallback(
    (perfil: PerfilPago): DatosOperador => ({
      perfil,
      conduces: conduces
        .filter((c) => c.creado_por === perfil.user_id)
        .map((c) => ({ fecha: c.fecha, horas: c.horas_cobrables, aprobado: c.estado === "Aprobado" })),
      feriados: feriadosMapa,
      ajustes: ajustes.filter((x) => x.user_id === perfil.user_id),
      deudas: deudas.filter((x) => x.user_id === perfil.user_id),
      descuentos: descuentos.filter((x) => x.user_id === perfil.user_id),
      pagos: pagos.filter((x) => x.user_id === perfil.user_id),
    }),
    [conduces, feriadosMapa, ajustes, deudas, descuentos, pagos]
  );

  const hoy = hoyRD();
  const actual = quincenaDe(hoy);
  const perfilElegido = perfiles.find((p) => p.user_id === elegido) ?? null;

  return (
    <main className="wrap">
      <Nav activa="pagos" />
      {perfilElegido ? (
        <PagoOperador datos={datosDe(perfilElegido)} onVolver={() => setElegido(null)} onChanged={cargar} />
      ) : (
        <>
          <div className="top">
            <h1>Pagos a operadores</h1>
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>
            Quincena en curso: {actual.etiqueta}
          </div>
          {error && <div className="error">{error}</div>}
          {cargando && <div className="empty">Cargando...</div>}
          {!cargando && !error && perfiles.length === 0 && <div className="empty">Todavía no hay operadores.</div>}

          {perfiles.map((p) => {
            const d = datosDe(p);
            const dias = calcularDias({
              inicio: actual.inicio,
              fin: actual.fin,
              pagaDesde: p.paga_desde,
              hoy,
              conduces: d.conduces,
              feriados: feriadosMapa,
              ajustes: Object.fromEntries(d.ajustes.map((a) => [a.fecha, { horas: a.horas, motivo: a.motivo }])),
            });
            const tot = totalizar(dias, p.tarifa_hora);
            const debe = redondear2(d.deudas.reduce((a, x) => a + saldoDeuda(x, d.descuentos), 0));
            const ultimo = [...d.pagos].sort((a, b) => (a.fecha_pago < b.fecha_pago ? 1 : -1))[0];
            return (
              <button key={p.user_id} className="card" onClick={() => setElegido(p.user_id)}>
                <div className="row">
                  <div>
                    <h2>{p.nombre || "Sin nombre"}</h2>
                    {(p.tarifa_hora == null || p.paga_desde == null) && (
                      <span className="pill taller">Falta la tarifa o la fecha de inicio</span>
                    )}
                  </div>
                  <div className="horas">
                    {fmtNum(tot.horas, 2)}
                    <small> h</small>
                  </div>
                </div>
                <div className="line">
                  Lleva ganado {fmtMonto(tot.bruto, "DOP")} en esta quincena
                  {tot.pendientes > 0 ? ` · ${fmtNum(tot.pendientes, 2)} h por aprobar` : ""}
                </div>
                {debe > 0 && <div className="line">Debe {fmtMonto(debe, "DOP")}</div>}
                <div className="line">
                  {ultimo ? `Último pago: ${fmtCorta(ultimo.fecha_pago)} · ${fmtMonto(ultimo.neto, "DOP")}` : "Sin pagos registrados"}
                </div>
              </button>
            );
          })}

          <Feriados feriados={feriados} onChanged={cargar} />
        </>
      )}
    </main>
  );
}
