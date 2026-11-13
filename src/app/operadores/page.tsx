"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { aNumero, fmtMonto, fmtNum, hoyRD, type Machine } from "@/lib/machines";
import { corteDe, resumenHoras, type Conduce } from "@/lib/conduces";
import TratosOperador from "@/components/TratosOperador";
import Link from "next/link";
import {
  aAjusteRow,
  aDeudaRow,
  aDescuentoRow,
  aPagoRow,
  aPerfilPago,
  aReporteDiaRow,
  aTratoRow,
  mapaAjustes,
  resumenPendiente,
  type AjusteRow,
  type DeudaRow,
  type DescuentoRow,
  type PagoRow,
  type ReporteDiaRow,
  type TratoRow,
} from "@/lib/pagos";

type Perfil = {
  user_id: string;
  rol: "admin" | "operador";
  nombre: string | null;
  activo: boolean;
  tarifa_hora: number | null;
  paga_desde: string | null;
  dieta_diaria: number;
  combustible_diario: number;
  combustible_por: "dia" | "semana";
  minimo_horas_dia: number;
  minimo_horas_sabado: number;
  horas_alojamiento: number;
  horas_sin_conduce: number;
  dieta_siempre: boolean;
};
type Asignacion = { user_id: string; machine_id: string };

function EditorOperador({
  perfil,
  maquinas,
  asignadas,
  onClose,
  onSaved,
}: {
  perfil: Perfil;
  maquinas: Machine[];
  asignadas: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState(perfil.nombre ?? "");
  const [activo, setActivo] = useState(perfil.activo);
  const [tarifa, setTarifa] = useState(perfil.tarifa_hora != null ? String(perfil.tarifa_hora) : "");
  const [pagaDesde, setPagaDesde] = useState(perfil.paga_desde ?? "");
  const [dieta, setDieta] = useState(String(perfil.dieta_diaria ?? 0));
  const [combustible, setCombustible] = useState(String(perfil.combustible_diario ?? 0));
  const [combPor, setCombPor] = useState<"dia" | "semana">(perfil.combustible_por ?? "dia");
  const [minDia, setMinDia] = useState(String(perfil.minimo_horas_dia ?? 8));
  const [minSab, setMinSab] = useState(String(perfil.minimo_horas_sabado ?? 8));
  const [hAloja, setHAloja] = useState(String(perfil.horas_alojamiento ?? 4));
  const [hSinConduce, setHSinConduce] = useState(String(perfil.horas_sin_conduce ?? 0));
  const [dietaSiempre, setDietaSiempre] = useState(perfil.dieta_siempre ?? false);
  const [elegidas, setElegidas] = useState<string[]>(asignadas);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function alternar(id: string) {
    setElegidas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nombre.trim() === "") return setError("Ponle el nombre del operador.");
    const t = tarifa.trim() === "" ? null : aNumero(tarifa);
    const di = aNumero(dieta.trim() === "" ? "0" : dieta);
    const co = aNumero(combustible.trim() === "" ? "0" : combustible);
    if (t != null && t < 0) return setError("La tarifa por hora no puede ser negativa.");
    if (tarifa.trim() !== "" && t == null) return setError("La tarifa por hora tiene que ser un número, por ejemplo 350.");
    if (di == null || di < 0 || co == null || co < 0) return setError("La dieta y el combustible tienen que ser números (puede ser 0).");
    const nMinDia = aNumero(minDia);
    const nMinSab = aNumero(minSab);
    const nAloja = aNumero(hAloja);
    const nSin = aNumero(hSinConduce);
    if ([nMinDia, nMinSab, nAloja, nSin].some((n) => n == null || n < 0))
      return setError("Las horas del trato tienen que ser números (pueden ser 0).");
    setGuardando(true);
    const supabase = createClient();
    const { error: e1 } = await supabase
      .from("perfiles")
      .update({
        nombre: nombre.trim(),
        activo,
        tarifa_hora: t,
        paga_desde: pagaDesde === "" ? null : pagaDesde,
        dieta_diaria: di,
        combustible_diario: co,
        combustible_por: combPor,
        minimo_horas_dia: nMinDia,
        minimo_horas_sabado: nMinSab,
        horas_alojamiento: nAloja,
        horas_sin_conduce: nSin,
        dieta_siempre: dietaSiempre,
      })
      .eq("user_id", perfil.user_id);
    if (e1) {
      setGuardando(false);
      return setError(`No se pudo guardar: ${e1.message}`);
    }
    // Se reemplazan las máquinas asignadas por las marcadas.
    const { error: e2 } = await supabase.from("operador_maquinas").delete().eq("user_id", perfil.user_id);
    if (e2) {
      setGuardando(false);
      return setError(`No se pudieron cambiar las máquinas: ${e2.message}`);
    }
    if (elegidas.length > 0) {
      const filas = elegidas.map((id) => ({
        user_id: perfil.user_id,
        machine_id: id,
        maquina_nombre: maquinas.find((m) => m.id === id)?.nombre ?? "Máquina",
      }));
      const { error: e3 } = await supabase.from("operador_maquinas").insert(filas);
      if (e3) {
        setGuardando(false);
        return setError(`No se pudieron asignar las máquinas: ${e3.message}`);
      }
    }
    setGuardando(false);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>Operador</h2>
        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="op-nombre">Nombre</label>
          <input id="op-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <div className="resumen">
          <b>Lo que cobra</b>
          <div className="grid2" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="op-tarifa">Precio por hora (RD$)</label>
              <input id="op-tarifa" inputMode="decimal" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="op-desde">Cobra desde</label>
              <input id="op-desde" type="date" value={pagaDesde} onChange={(e) => setPagaDesde(e.target.value)} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="op-dieta">Dieta por día (RD$)</label>
              <input id="op-dieta" inputMode="decimal" value={dieta} onChange={(e) => setDieta(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="op-comb">Combustible (RD$)</label>
              <input id="op-comb" inputMode="decimal" value={combustible} onChange={(e) => setCombustible(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="op-combpor">El combustible se da por</label>
            <select id="op-combpor" value={combPor} onChange={(e) => setCombPor(e.target.value as "dia" | "semana")}>
              <option value="dia">Día</option>
              <option value="semana">Semana (se reparte entre lunes y sábado; el domingo no suma)</option>
            </select>
          </div>
          <div className="hint">
            El precio por hora es el que acordaste con el operador y no cambia salvo que tú lo cambies. La dieta y el combustible se pagan los días que está presente (con conduce o con reporte de día aprobado); se entregan cada lunes. Antes de la fecha "cobra desde" no se le paga nada.
          </div>
        </div>

        <div className="resumen">
          <b>El trato con este operador</b>
          <div className="grid2" style={{ marginTop: 8 }}>
            <div className="field">
              <label htmlFor="op-mindia">Mínimo de horas, lunes a viernes con conduce</label>
              <input id="op-mindia" inputMode="decimal" value={minDia} onChange={(e) => setMinDia(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="op-minsab">Mínimo de horas del sábado con conduce</label>
              <input id="op-minsab" inputMode="decimal" value={minSab} onChange={(e) => setMinSab(e.target.value)} />
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label htmlFor="op-aloja">Horas del día "estuve en el alojamiento"</label>
              <input id="op-aloja" inputMode="decimal" value={hAloja} onChange={(e) => setHAloja(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="op-sin">Horas del día sin conduce ni reporte</label>
              <input id="op-sin" inputMode="decimal" value={hSinConduce} onChange={(e) => setHSinConduce(e.target.value)} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={dietaSiempre} onChange={(e) => setDietaSiempre(e.target.checked)} />
            El día "estuve en el alojamiento" también cobra dieta y combustible
          </label>
          <div className="hint">
            Si trabaja más del mínimo, se le pagan las horas completas hacia arriba (con 15 minutos de margen). Domingos y
            festivos: no se pagan, salvo que pidan la máquina; entonces es el doble de las horas.
          </div>
        </div>

        <TratosOperador perfil={aPerfilPago(perfil as unknown as Record<string, unknown>)} />

        <div className="field">
          <label>Máquinas que puede reportar</label>
          {maquinas.map((m) => (
            <label className="check" key={m.id}>
              <input type="checkbox" checked={elegidas.includes(m.id)} onChange={() => alternar(m.id)} />
              {m.nombre}
            </label>
          ))}
        </div>

        <label className="check">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Puede entrar a la app
        </label>
        {!activo && <div className="aviso">Desactivado: no podrá entrar ni subir conduces. Su historial se conserva.</div>}

        <div className="actions">
          <button type="submit" className="btn primary grow" disabled={guardando}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export default function OperadoresPage() {
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [conduces, setConduces] = useState<Pick<Conduce, "creado_por" | "fecha" | "estado" | "horas_cobrables">[]>([]);
  // Datos para calcular lo que se le paga a cada operador (las mismas reglas de la pantalla Pagos)
  const [pagoDatos, setPagoDatos] = useState<{
    feriados: Record<string, string>;
    ajustes: AjusteRow[];
    reportes: ReporteDiaRow[];
    tratos: TratoRow[];
    deudas: DeudaRow[];
    descuentos: DescuentoRow[];
    pagos: PagoRow[];
  }>({ feriados: {}, ajustes: [], reportes: [], tratos: [], deudas: [], descuentos: [], pagos: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Perfil | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [p, a, m, c, f, aj, rd, tr, de, ds, pg] = await Promise.all([
      supabase
        .from("perfiles")
        .select("user_id, rol, nombre, activo, tarifa_hora, paga_desde, dieta_diaria, combustible_diario, combustible_por, minimo_horas_dia, minimo_horas_sabado, horas_alojamiento, horas_sin_conduce, dieta_siempre")
        .order("nombre"),
      supabase.from("operador_maquinas").select("user_id, machine_id"),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("creado_por, fecha, estado, horas_cobrables"),
      supabase.from("feriados").select("fecha, nombre"),
      supabase.from("dias_operador").select("*"),
      supabase.from("reportes_dia").select("*"),
      supabase.from("tratos_operador").select("*"),
      supabase.from("deudas").select("*"),
      supabase.from("descuentos_deuda").select("*"),
      supabase.from("pagos_operador").select("*"),
    ]);
    const fallo =
      p.error ?? a.error ?? m.error ?? c.error ?? f.error ?? aj.error ?? rd.error ?? tr.error ?? de.error ?? ds.error ?? pg.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setPerfiles(
        ((p.data ?? []) as Perfil[]).map((x) => ({
          ...x,
          tarifa_hora: x.tarifa_hora == null ? null : Number(x.tarifa_hora),
          dieta_diaria: Number(x.dieta_diaria ?? 0),
          combustible_diario: Number(x.combustible_diario ?? 0),
          combustible_por: (x.combustible_por as "dia" | "semana") ?? "dia",
          minimo_horas_dia: Number(x.minimo_horas_dia ?? 8),
          minimo_horas_sabado: Number(x.minimo_horas_sabado ?? 8),
          horas_alojamiento: Number(x.horas_alojamiento ?? 4),
          horas_sin_conduce: Number(x.horas_sin_conduce ?? 0),
          dieta_siempre: Boolean(x.dieta_siempre),
        }))
      );
      const fer: Record<string, string> = {};
      (f.data ?? []).forEach((x: { fecha: string; nombre: string }) => (fer[x.fecha] = x.nombre));
      setPagoDatos({
        feriados: fer,
        ajustes: (aj.data ?? []).map(aAjusteRow),
        reportes: (rd.data ?? []).map(aReporteDiaRow),
        tratos: (tr.data ?? []).map(aTratoRow),
        deudas: (de.data ?? []).map(aDeudaRow),
        descuentos: (ds.data ?? []).map(aDescuentoRow),
        pagos: (pg.data ?? []).map(aPagoRow),
      });
      setAsignaciones((a.data ?? []) as Asignacion[]);
      setMaquinas((m.data ?? []) as Machine[]);
      setConduces(
        ((c.data ?? []) as typeof conduces).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const operadores = perfiles.filter((p) => p.rol === "operador");
  const hoy = hoyRD();
  const etiquetaCorte = corteDe(hoy).etiqueta;
  const horasDe = useMemo(() => {
    const mapa = new Map<string, ReturnType<typeof resumenHoras>>();
    operadores.forEach((o) => {
      mapa.set(
        o.user_id,
        resumenHoras(
          conduces.filter((c) => c.creado_por === o.user_id),
          hoy
        )
      );
    });
    return mapa;
  }, [operadores, conduces, hoy]);

  const esDueno = (uid: string) => maquinas.some((m) => (m as Machine & { dueno_user_id?: string | null }).dueno_user_id === uid);
  const pendienteDe = (o: Perfil) =>
    resumenPendiente({
      perfil: aPerfilPago(o as unknown as Record<string, unknown>),
      tratos: pagoDatos.tratos.filter((t) => t.user_id === o.user_id),
      hoy,
      conduces: conduces
        .filter((c) => c.creado_por === o.user_id && c.estado !== "Rechazado")
        .map((c) => ({ fecha: c.fecha, horas: c.horas_cobrables, aprobado: c.estado === "Aprobado" })),
      feriados: pagoDatos.feriados,
      ajustes: mapaAjustes(
        pagoDatos.ajustes.filter((x) => x.user_id === o.user_id),
        pagoDatos.reportes.filter((x) => x.user_id === o.user_id)
      ),
      deudas: pagoDatos.deudas.filter((x) => x.user_id === o.user_id),
      descuentos: pagoDatos.descuentos.filter((x) => x.user_id === o.user_id),
      pagos: pagoDatos.pagos.filter((x) => x.user_id === o.user_id),
    });

  return (
    <main className="wrap">
      <Nav activa="operadores" />
      <div className="top">
        <h1>Operadores</h1>
      </div>

      <div className="resumen" style={{ fontSize: 14 }}>
        <b>Para agregar un operador:</b> en Supabase entra a Authentication &gt; Users &gt; Add user, y crea su correo
        y una clave. Cuando el operador exista, aparece aquí sin máquinas: tócalo, ponle su nombre y marca las máquinas
        que puede reportar. Le das el correo y la clave y abre la app en su celular.
      </div>

      {error && <div className="error">{error}</div>}
      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && !error && operadores.length === 0 && (
        <div className="empty">Todavía no hay operadores.</div>
      )}

      {operadores.filter((o) => !esDueno(o.user_id)).map((o) => {
        const suyas = asignaciones.filter((a) => a.user_id === o.user_id).map((a) => a.machine_id);
        const nombres = suyas.map((id) => maquinas.find((m) => m.id === id)?.nombre).filter(Boolean).join(", ");
        const h = horasDe.get(o.user_id);
        const pend = pendienteDe(o);
        return (
          <button key={o.user_id} className="card" onClick={() => setEditando(o)}>
            <div className="row">
              <div>
                <h2>{o.nombre || "Sin nombre"}</h2>
                <span className={o.activo ? "pill disp" : "pill taller"}>{o.activo ? "Activo" : "Desactivado"}</span>
              </div>
              <div className="horas">
                {fmtNum(pend.horas, 2)}
                <small> h a pagar</small>
              </div>
            </div>
            <div className="line">{nombres || "Sin máquinas asignadas"}</div>
            <div className="line">
              {o.tarifa_hora != null ? `${fmtMonto(o.tarifa_hora, "DOP")} por hora` : "Sin precio por hora todavía"}
              {pend.horas > 0 && o.tarifa_hora != null ? ` · ganado sin pagar: ${fmtMonto(pend.ganado, "DOP")}` : ""}
            </div>
            <div className="line">
              Horas de sus conduces en el corte {etiquetaCorte} (las que se cobran al cliente): {fmtNum(h?.aprobadas ?? 0, 2)} h
              {h && h.pendientes > 0 ? ` · ${fmtNum(h.pendientes, 2)} h por aprobar` : ""}
              {h && h.rechazadas > 0 ? ` · ${fmtNum(h.rechazadas, 2)} h rechazadas` : ""}
            </div>
          </button>
        );
      })}

      <div className="hint" style={{ marginTop: 8 }}>
        "Horas a pagar" son las horas que se le pagan al operador: mínimo por día, horas completas hacia arriba, domingos
        dobles y los días que reportó sin conduce. Son las de su pago sin cobrar. Las "horas de sus conduces" son las
        horas reales de la máquina que se cobran al cliente, y por eso son menos. El detalle día por día y el total a
        pagarle están en <Link href="/pagos" style={{ textDecoration: "underline" }}>Pagos</Link>.
      </div>

      {operadores.filter((o) => esDueno(o.user_id)).map((o) => {
        const h = horasDe.get(o.user_id);
        const nombres = asignaciones
          .filter((a) => a.user_id === o.user_id)
          .map((a) => maquinas.find((m) => m.id === a.machine_id)?.nombre)
          .filter(Boolean)
          .join(", ");
        return (
          <button key={o.user_id} className="card" onClick={() => setEditando(o)}>
            <div className="row">
              <div>
                <h2>{o.nombre || "Sin nombre"}</h2>
                <span className="pill obra">Dueño de la máquina</span>
              </div>
              <div className="horas">
                {fmtNum(h?.aprobadas ?? 0, 2)}
                <small> h de la máquina</small>
              </div>
            </div>
            <div className="line">{nombres || "Sin máquinas asignadas"}</div>
            <div className="line">
              No cobra por hora de operador: lo suyo (horas × pago al dueño, menos el combustible) se ve en Corte, en
              "Pago a dueños".
            </div>
          </button>
        );
      })}

      {editando && (
        <EditorOperador
          perfil={editando}
          maquinas={maquinas}
          asignadas={asignaciones.filter((a) => a.user_id === editando.user_id).map((a) => a.machine_id)}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </main>
  );
}
