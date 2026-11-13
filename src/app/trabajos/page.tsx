"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { fmtMonto, fmtNum, hoyRD } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { aAjusteRow, aPerfilPago, aReporteDiaRow, aTratoRow, redondear2, type PerfilPago } from "@/lib/pagos";
import {
  aParte,
  aTrabajo,
  costoDiasOperador,
  costosTrabajo,
  type CargaTrabajo,
  type ConduceTrabajo,
  type CostoDia,
  type Parte,
  type Trabajo,
} from "@/lib/trabajos";

const dinero = (n: number) => fmtMonto(n, "DOP");

type Maq = {
  id: string;
  nombre: string;
  propiedad: string;
  pago_dueno: number | null;
  descuenta_combustible_dueno: boolean;
  dueno_user_id: string | null;
};
type Cli = { id: string; nombre: string };

export default function TrabajosPage() {
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const [maquinas, setMaquinas] = useState<Maq[]>([]);
  const [clientes, setClientes] = useState<Cli[]>([]);
  const [conduces, setConduces] = useState<ConduceTrabajo[]>([]);
  const [cargas, setCargas] = useState<CargaTrabajo[]>([]);
  const [operadores, setOperadores] = useState<Map<string, Map<string, CostoDia>>>(new Map());
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [tasa, setTasa] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const hoy = hoyRD();
    const [t, p, m, c, cd, fl, pf, tr, aj, rd, fe, pr] = await Promise.all([
      supabase.from("trabajos").select("*").order("created_at", { ascending: false }),
      supabase.from("trabajo_partes").select("*").order("orden"),
      supabase.from("machines").select("id, nombre, propiedad, pago_dueno, descuenta_combustible_dueno, dueno_user_id").order("nombre"),
      supabase.from("clients").select("id, nombre").order("nombre"),
      supabase
        .from("conduces")
        .select("id, numero, libreta, fecha, machine_id, horas_cobrables, estado, creado_por, parte_id, parte_terminada")
        .in("estado", ["Aprobado", "Pendiente"]),
      supabase.from("fuel_logs").select("machine_id, fecha, galones, origen, estado, monto, moneda"),
      supabase
        .from("perfiles")
        .select("user_id, nombre, activo, tarifa_hora, paga_desde, dieta_diaria, combustible_diario, combustible_por, horas_alojamiento, horas_sin_conduce, minimo_horas_dia, minimo_horas_sabado, dieta_siempre")
        .eq("rol", "operador"),
      supabase.from("tratos_operador").select("*"),
      supabase.from("dias_operador").select("*"),
      supabase.from("reportes_dia").select("*"),
      supabase.from("feriados").select("fecha, nombre"),
      supabase.from("corte_precios").select("corte, tasa_dolar").order("corte", { ascending: false }).limit(1),
    ]);
    const fallo = t.error ?? p.error ?? m.error ?? c.error ?? cd.error ?? fl.error ?? pf.error ?? tr.error ?? aj.error ?? rd.error ?? fe.error ?? pr.error;
    if (fallo) {
      setError(`No se pudieron cargar los trabajos: ${fallo.message}`);
      setCargando(false);
      return;
    }
    setError("");
    setTrabajos((t.data ?? []).map(aTrabajo));
    setPartes((p.data ?? []).map(aParte));
    setMaquinas(
      (m.data ?? []).map((x: Record<string, unknown>) => ({
        id: String(x.id),
        nombre: String(x.nombre),
        propiedad: String(x.propiedad),
        pago_dueno: x.pago_dueno == null ? null : Number(x.pago_dueno),
        descuenta_combustible_dueno: Boolean(x.descuenta_combustible_dueno),
        dueno_user_id: (x.dueno_user_id as string | null) ?? null,
      }))
    );
    setClientes((c.data ?? []) as Cli[]);
    const filas: ConduceTrabajo[] = (cd.data ?? []).map((x: Record<string, unknown>) => ({
      id: String(x.id),
      numero: Number(x.numero),
      libreta: String(x.libreta),
      fecha: String(x.fecha),
      machine_id: String(x.machine_id),
      horas_cobrables: Number(x.horas_cobrables),
      estado: String(x.estado),
      creado_por: (x.creado_por as string | null) ?? null,
      parte_id: (x.parte_id as string | null) ?? null,
      parte_terminada: Boolean(x.parte_terminada),
    }));
    setConduces(filas);
    setCargas(
      (fl.data ?? []).map((x: Record<string, unknown>) => ({
        machine_id: String(x.machine_id),
        fecha: String(x.fecha),
        galones: Number(x.galones),
        origen: String(x.origen),
        estado: String(x.estado),
        monto: x.monto == null ? null : Number(x.monto),
        moneda: (x.moneda as string | null) ?? null,
      }))
    );
    setTasa(pr.data && pr.data[0] && pr.data[0].tasa_dolar != null ? Number(pr.data[0].tasa_dolar) : null);

    const feriados: Record<string, string> = {};
    (fe.data ?? []).forEach((f: { fecha: string; nombre: string }) => (feriados[f.fecha] = f.nombre));
    const perfiles: PerfilPago[] = (pf.data ?? []).map(aPerfilPago);
    const tratos = (tr.data ?? []).map(aTratoRow);
    const ajustes = (aj.data ?? []).map(aAjusteRow);
    const reportes = (rd.data ?? []).map(aReporteDiaRow);
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
    setNombres(Object.fromEntries(perfiles.map((x) => [x.user_id, x.nombre ?? "Operador"])));
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hoy = hoyRD();
  const trabajo = trabajos.find((t) => t.id === abierto) ?? null;

  return (
    <main className="wrap">
      <Nav activa="trabajos" />
      {trabajo ? (
        <Detalle
          trabajo={trabajo}
          partes={partes.filter((p) => p.trabajo_id === trabajo.id)}
          maquina={maquinas.find((m) => m.id === trabajo.machine_id)}
          cliente={clientes.find((c) => c.id === trabajo.client_id)?.nombre ?? null}
          conduces={conduces.filter((c) => c.machine_id === trabajo.machine_id)}
          cargas={cargas.filter((c) => c.machine_id === trabajo.machine_id)}
          operadores={operadores}
          nombres={nombres}
          tasa={tasa}
          hoy={hoy}
          onVolver={() => setAbierto(null)}
          onChanged={cargar}
        />
      ) : (
        <>
          <div className="top">
            <h1>Trabajos a precio cerrado</h1>
            <button className="btn primary" onClick={() => setCreando(true)}>
              + Nuevo
            </button>
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>
            Para trabajos que no se cobran por hora, por ejemplo piscinas a RD$30,000 cada una. El operador sube sus conduces
            y dice en cuál piscina trabajó; la app suma lo que costó y te dice cuánto ganaste.
          </div>
          {error && <div className="error">{error}</div>}
          {cargando && <div className="empty">Cargando...</div>}
          {!cargando && !error && trabajos.length === 0 && (
            <div className="empty">Todavía no hay trabajos a precio cerrado. Toca “+ Nuevo”.</div>
          )}
          {trabajos.map((t) => {
            const ps = partes.filter((p) => p.trabajo_id === t.id);
            const m = maquinas.find((x) => x.id === t.machine_id);
            const r = costosTrabajo({
              trabajo: t,
              partes: ps,
              maquina: m ?? { propiedad: "Propia", pago_dueno: null, descuenta_combustible_dueno: false, dueno_user_id: null },
              conduces: conduces.filter((c) => c.machine_id === t.machine_id),
              cargas: cargas.filter((c) => c.machine_id === t.machine_id),
              operadores,
              tasaDolar: tasa,
              hoy,
            });
            const hechas = ps.filter((p) => p.terminada_en);
            const precio = ps.reduce((a, p) => a + p.precio, 0);
            const costoHechas = hechas.reduce((a, p) => a + (r.porParte.get(p.id)?.total ?? 0), 0);
            const ganado = hechas.reduce((a, p) => a + p.precio, 0) - costoHechas;
            return (
              <button key={t.id} className="card" onClick={() => setAbierto(t.id)}>
                <div className="row">
                  <div>
                    <h2>{t.nombre}</h2>
                    <span className={t.estado === "Cerrado" ? "pill disp" : "pill obra"}>{t.estado === "Cerrado" ? "Cerrado" : "Abierto"}</span>
                  </div>
                  <div className="horas" style={{ fontSize: 20 }}>
                    {hechas.length}/{ps.length}
                    <small> terminadas</small>
                  </div>
                </div>
                <div className="line">
                  {m?.nombre ?? "Máquina"} · total del trabajo {dinero(precio)}
                </div>
                {hechas.length > 0 && (
                  <div className="line">
                    En las terminadas: {ganado >= 0 ? "ganaste" : "perdiste"} <b>{dinero(Math.abs(redondear2(ganado)))}</b>
                  </div>
                )}
              </button>
            );
          })}
        </>
      )}

      {creando && (
        <NuevoTrabajo
          maquinas={maquinas}
          clientes={clientes}
          onClose={() => setCreando(false)}
          onSaved={(id) => {
            setCreando(false);
            cargar().then(() => setAbierto(id));
          }}
        />
      )}
    </main>
  );
}

function NuevoTrabajo({
  maquinas,
  clientes,
  onClose,
  onSaved,
}: {
  maquinas: Maq[];
  clientes: Cli[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [machineId, setMachineId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [obra, setObra] = useState("");
  const [inicio, setInicio] = useState(hoyRD());
  const [cuantas, setCuantas] = useState("4");
  const [base, setBase] = useState("Piscina");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const n = Number(cuantas);
    const p = Number(precio.replace(/,/g, "").replace(",", "."));
    if (nombre.trim() === "") return setError("Ponle un nombre al trabajo, por ejemplo “Piscinas de papá”.");
    if (!machineId) return setError("Escoge la máquina.");
    if (!Number.isInteger(n) || n < 1 || n > 50) return setError("Pon cuántas piscinas son, por ejemplo 4.");
    if (!Number.isFinite(p) || p < 0 || precio.trim() === "") return setError("Pon el precio de cada una, por ejemplo 30000.");
    if (!inicio) return setError("Pon la fecha en que empieza.");
    setGuardando(true);
    const supabase = createClient();
    const { data, error: e1 } = await supabase
      .from("trabajos")
      .insert({
        nombre: nombre.trim(),
        machine_id: machineId,
        client_id: clienteId || null,
        obra: obra.trim() || null,
        fecha_inicio: inicio,
      })
      .select("id")
      .single();
    if (e1 || !data) {
      setGuardando(false);
      return setError(`No se pudo guardar: ${e1?.message ?? "error"}`);
    }
    const nombreBase = base.trim() || "Parte";
    const { error: e2 } = await supabase
      .from("trabajo_partes")
      .insert(Array.from({ length: n }, (_, i) => ({ trabajo_id: data.id, nombre: `${nombreBase} ${i + 1}`, precio: p, orden: i + 1 })));
    setGuardando(false);
    if (e2) return setError(`El trabajo se creó, pero no se pudieron crear las piscinas: ${e2.message}`);
    onSaved(data.id);
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>Nuevo trabajo a precio cerrado</h2>
        {error && <div className="error">{error}</div>}
        <div className="field">
          <label htmlFor="t-nombre">Nombre del trabajo</label>
          <input id="t-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Piscinas de papá" />
        </div>
        <div className="field">
          <label htmlFor="t-maq">Máquina que lo hace</label>
          <select id="t-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
            <option value="">Escoge la máquina</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-cli">Cliente (opcional)</label>
          <select id="t-cli" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-obra">Lugar (opcional)</label>
          <input id="t-obra" value={obra} onChange={(e) => setObra(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="t-inicio">Desde qué fecha cuentan las horas</label>
          <input id="t-inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="t-cuantas">¿Cuántas son?</label>
            <input id="t-cuantas" inputMode="numeric" value={cuantas} onChange={(e) => setCuantas(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t-base">Cómo se llaman</label>
            <input id="t-base" value={base} onChange={(e) => setBase(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="t-precio">Precio de cada una (RD$)</label>
          <input id="t-precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Ej: 30000" />
          <div className="hint">
            Se crean {cuantas || "…"} partes: {base || "Parte"} 1, {base || "Parte"} 2… Después puedes cambiar el precio de
            cada una.
          </div>
        </div>
        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : "Crear trabajo"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function Detalle({
  trabajo,
  partes,
  maquina,
  cliente,
  conduces,
  cargas,
  operadores,
  nombres,
  tasa,
  hoy,
  onVolver,
  onChanged,
}: {
  trabajo: Trabajo;
  partes: Parte[];
  maquina: Maq | undefined;
  cliente: string | null;
  conduces: ConduceTrabajo[];
  cargas: CargaTrabajo[];
  operadores: Map<string, Map<string, CostoDia>>;
  nombres: Record<string, string>;
  tasa: number | null;
  hoy: string;
  onVolver: () => void;
  onChanged: () => void;
}) {
  const [error, setError] = useState("");
  const [verConduces, setVerConduces] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [precioEdit, setPrecioEdit] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [borrar, setBorrar] = useState(false);

  const r = useMemo(
    () =>
      costosTrabajo({
        trabajo,
        partes,
        maquina: maquina ?? { propiedad: "Propia", pago_dueno: null, descuenta_combustible_dueno: false, dueno_user_id: null },
        conduces,
        cargas,
        operadores,
        tasaDolar: tasa,
        hoy,
      }),
    [trabajo, partes, maquina, conduces, cargas, operadores, tasa, hoy]
  );

  const enTrabajo = conduces
    .filter((c) => c.fecha >= trabajo.fecha_inicio)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.numero - a.numero));
  const pendientes = enTrabajo.filter((c) => c.estado === "Pendiente").length;

  const precioTotal = partes.reduce((a, p) => a + p.precio, 0);
  const hechas = partes.filter((p) => p.terminada_en);
  const costoHechas = redondear2(hechas.reduce((a, p) => a + (r.porParte.get(p.id)?.total ?? 0), 0));
  const cobradoHechas = hechas.reduce((a, p) => a + p.precio, 0);
  const ganancia = redondear2(cobradoHechas - costoHechas);
  const costoTodo = redondear2([...r.porParte.values()].reduce((a, v) => a + v.total, 0) + r.sinAsignar.total);

  async function accion(f: () => PromiseLike<{ error: { message: string } | null }>, msg: string) {
    setError("");
    const { error: e } = await f();
    if (e) return setError(`${msg}: ${e.message}`);
    onChanged();
  }
  const sb = () => createClient();

  const terminar = (p: Parte) =>
    accion(() => sb().from("trabajo_partes").update({ terminada_en: hoy }).eq("id", p.id), "No se pudo marcar terminada");
  const reabrir = (p: Parte) =>
    accion(() => sb().from("trabajo_partes").update({ terminada_en: null }).eq("id", p.id), "No se pudo reabrir");
  const asignar = (c: ConduceTrabajo, parteId: string) =>
    accion(
      () => sb().from("conduces").update({ parte_id: parteId || null, parte_terminada: parteId ? c.parte_terminada : false }).eq("id", c.id),
      "No se pudo asignar el conduce"
    );
  async function guardarPrecio(p: Parte) {
    const n = Number(precioEdit.replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0 || precioEdit.trim() === "") return setError("Escribe el precio, por ejemplo 30000.");
    setEditando(null);
    await accion(() => sb().from("trabajo_partes").update({ precio: n }).eq("id", p.id), "No se pudo guardar el precio");
  }
  async function agregarParte(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(nuevoPrecio.replace(/,/g, ""));
    if (nuevoNombre.trim() === "" || !Number.isFinite(n) || nuevoPrecio.trim() === "") return setError("Pon el nombre y el precio.");
    setNuevoNombre("");
    setNuevoPrecio("");
    await accion(
      () =>
        sb()
          .from("trabajo_partes")
          .insert({ trabajo_id: trabajo.id, nombre: nuevoNombre.trim(), precio: n, orden: partes.length + 1 }),
      "No se pudo agregar"
    );
  }
  async function cerrarTrabajo() {
    await accion(
      () => sb().from("trabajos").update({ estado: trabajo.estado === "Abierto" ? "Cerrado" : "Abierto" }).eq("id", trabajo.id),
      "No se pudo cambiar el estado"
    );
  }
  async function borrarTrabajo() {
    if (!borrar) {
      setBorrar(true);
      setTimeout(() => setBorrar(false), 5000);
      return;
    }
    const { error: e } = await sb().from("trabajos").delete().eq("id", trabajo.id);
    if (e) return setError(`No se pudo borrar: ${e.message}`);
    onChanged();
    onVolver();
  }

  return (
    <>
      <div className="top">
        <button className="btn small" onClick={onVolver}>
          ← Trabajos
        </button>
      </div>
      <h1 style={{ marginTop: 8 }}>{trabajo.nombre}</h1>
      <div className="line">
        {maquina?.nombre ?? "Máquina"}
        {cliente ? ` · ${cliente}` : ""}
        {trabajo.obra ? ` · ${trabajo.obra}` : ""} · cuenta desde el {fmtFecha(trabajo.fecha_inicio)}
      </div>
      {error && <div className="error">{error}</div>}

      <div className="totales dos" style={{ marginTop: 12 }}>
        <div className="total">
          <div className="total-n">Total del trabajo</div>
          <div className="total-h">{dinero(precioTotal)}</div>
          <div className="total-c">
            {hechas.length} de {partes.length} terminadas
          </div>
        </div>
        <div className="total">
          <div className="total-n">{ganancia >= 0 ? "Ganado en las terminadas" : "Perdido en las terminadas"}</div>
          <div className="total-h" style={{ color: ganancia >= 0 ? "var(--ok)" : "var(--danger)" }}>
            {dinero(Math.abs(ganancia))}
          </div>
          <div className="total-c">
            cobrado {dinero(cobradoHechas)} − costo {dinero(costoHechas)}
          </div>
        </div>
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        Costo hasta hoy de todo el trabajo (terminado o no): {dinero(costoTodo)}
        {r.combustiblePorHora != null ? ` · combustible: ${dinero(r.combustiblePorHora)} por hora de máquina` : ""}.
        {pendientes > 0 ? ` Hay ${pendientes} conduce${pendientes === 1 ? "" : "s"} esperando aprobación; no cuentan todavía.` : ""}
      </div>

      {partes.map((p) => {
        const c = r.porParte.get(p.id);
        const hecha = p.terminada_en != null;
        const gan = c ? redondear2(p.precio - c.total) : null;
        return (
          <div key={p.id} className="card" style={{ cursor: "default" }}>
            <div className="row">
              <div>
                <h2>{p.nombre}</h2>
                <span className={hecha ? "pill disp" : "pill obra"}>
                  {hecha ? `Terminada el ${fmtFecha(p.terminada_en!)}` : "En proceso"}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <b>{dinero(p.precio)}</b>
                <div className="line" style={{ marginTop: 0 }}>
                  {fmtNum(c?.horas ?? 0, 2)} h
                </div>
              </div>
            </div>
            {c && (
              <div style={{ marginTop: 8, fontSize: 14 }}>
                <div className="row">
                  <span>Operador (horas, dieta y combustible)</span>
                  <span>{dinero(c.operador)}</span>
                </div>
                <div className="row">
                  <span>Combustible de la máquina</span>
                  <span>{dinero(c.combustible)}</span>
                </div>
                {maquina?.pago_dueno != null && (
                  <div className="row">
                    <span>Pago al dueño de la máquina</span>
                    <span>{dinero(c.dueno)}</span>
                  </div>
                )}
                <div className="row" style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 4 }}>
                  <b>Costo hasta hoy</b>
                  <b>{dinero(c.total)}</b>
                </div>
                {gan != null && (
                  <div className="row">
                    <b>{hecha ? (gan >= 0 ? "Ganaste" : "Perdiste") : gan >= 0 ? "Queda para ganar si terminas hoy" : "Ya va en pérdida"}</b>
                    <b style={{ color: gan >= 0 ? "var(--ok)" : "var(--danger)" }}>{dinero(Math.abs(gan))}</b>
                  </div>
                )}
                {c.incompleto && (
                  <div className="aviso">Falta el precio de alguna carga de combustible; el costo está incompleto.</div>
                )}
              </div>
            )}
            {editando === p.id ? (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input inputMode="decimal" value={precioEdit} onChange={(e) => setPrecioEdit(e.target.value)} aria-label="Precio" />
                <button className="btn primary" onClick={() => guardarPrecio(p)}>
                  Guardar
                </button>
                <button className="btn" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {hecha ? (
                  <button className="btn small" onClick={() => reabrir(p)}>
                    Reabrir
                  </button>
                ) : (
                  <button className="btn small primary" onClick={() => terminar(p)}>
                    Marcar terminada hoy
                  </button>
                )}
                <button
                  className="btn small"
                  onClick={() => {
                    setEditando(p.id);
                    setPrecioEdit(String(p.precio));
                  }}
                >
                  Cambiar precio
                </button>
              </div>
            )}
          </div>
        );
      })}

      {r.sinAsignar.horas > 0 && (
        <div className="resumen">
          <b>Horas sin piscina: {fmtNum(r.sinAsignar.horas, 2)} h</b>
          <div className="line">
            Son conduces de la máquina desde que empezó el trabajo que todavía no están en ninguna piscina. Costaron{" "}
            {dinero(r.sinAsignar.total)}. Asígnalos abajo para que cuenten en la piscina.
          </div>
        </div>
      )}

      <form onSubmit={agregarParte} className="resumen">
        <b>Agregar otra piscina</b>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div className="field">
            <label htmlFor="np-n">Nombre</label>
            <input id="np-n" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="np-p">Precio (RD$)</label>
            <input id="np-p" inputMode="decimal" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} />
          </div>
        </div>
        <button className="btn small" type="submit">
          Agregar
        </button>
      </form>

      <button className="btn" style={{ width: "100%", marginBottom: 12 }} onClick={() => setVerConduces(!verConduces)}>
        {verConduces ? "Ocultar los conduces" : `Conduces de la máquina desde el ${fmtFecha(trabajo.fecha_inicio)} (${enTrabajo.length})`}
      </button>
      {verConduces && (
        <div className="resumen">
          <div className="hint" style={{ marginTop: 0 }}>
            Escoge en qué piscina se trabajó cada día. Si el operador marcó la piscina al subir el conduce, ya sale puesta.
          </div>
          {enTrabajo.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
              <div className="row">
                <span>
                  {fmtFecha(c.fecha)} · #{c.numero} · {fmtNum(c.horas_cobrables, 2)} h
                  <div className="line" style={{ marginTop: 0 }}>
                    {c.creado_por ? nombres[c.creado_por] ?? "Operador" : "Cargado por la oficina"}
                    {c.estado === "Pendiente" ? " · por aprobar" : ""}
                    {c.parte_terminada ? " · dijo que terminó" : ""}
                  </div>
                </span>
                <select value={c.parte_id ?? ""} onChange={(e) => asignar(c, e.target.value)} aria-label="Piscina">
                  <option value="">Sin piscina</option>
                  {partes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        <button className="btn" onClick={cerrarTrabajo}>
          {trabajo.estado === "Abierto" ? "Cerrar el trabajo" : "Volver a abrir el trabajo"}
        </button>
        <button className={`btn danger${borrar ? " armed" : ""}`} onClick={borrarTrabajo}>
          {borrar ? "Toca otra vez para borrar" : "Borrar el trabajo"}
        </button>
      </div>
    </>
  );
}
