"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import ConduceEditor from "@/components/ConduceEditor";
import { fmtNum, hoyRD, type Machine } from "@/lib/machines";
import { corteDe, fmtFecha, noCuadra, type Cliente, type Conduce, type EstadoConduce } from "@/lib/conduces";

export default function ConducesPage() {
  const [conduces, setConduces] = useState<Conduce[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtroCorte, setFiltroCorte] = useState<string | null>(null); // null = aún sin escoger
  const [filtroMaquina, setFiltroMaquina] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<EstadoConduce | "todos" | null>(null);
  // undefined = editor cerrado, null = conduce nuevo, Conduce = editando
  const [editando, setEditando] = useState<Conduce | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [c, m, cl] = await Promise.all([
      supabase
        .from("conduces")
        .select("*, machines(nombre), clients(nombre), creador:perfiles!conduces_creado_por_fkey(nombre)")
        .order("fecha", { ascending: false })
        .order("numero", { ascending: false }),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("clients").select("id, nombre, rnc").order("nombre"),
    ]);
    const fallo = c.error ?? m.error ?? cl.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setConduces((c.data ?? []) as unknown as Conduce[]);
      setMaquinas((m.data ?? []) as Machine[]);
      setClientes((cl.data ?? []) as Cliente[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cortes que existen en los datos, el más reciente primero.
  const cortes = useMemo(() => {
    const mapa = new Map<string, string>();
    conduces.forEach((c) => {
      const k = corteDe(c.fecha);
      mapa.set(k.clave, k.etiqueta);
    });
    return [...mapa.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([clave, etiqueta]) => ({ clave, etiqueta }));
  }, [conduces]);

  // Al abrir: el corte de hoy si tiene conduces; si no, el más reciente.
  const corteActivo =
    filtroCorte ??
    (cortes.find((c) => c.clave === corteDe(hoyRD()).clave)?.clave ?? cortes[0]?.clave ?? "todos");

  const pendientes = conduces.filter((c) => c.estado === "Pendiente").length;
  const rechazados = conduces.filter((c) => c.estado === "Rechazado").length;
  // Al abrir: lo que espera tu aprobación; si no hay nada pendiente, lo aprobado.
  const estadoActivo = filtroEstado ?? (pendientes > 0 ? "Pendiente" : "Aprobado");

  const delCorteYMaquina = conduces.filter(
    (c) =>
      (corteActivo === "todos" || corteDe(c.fecha).clave === corteActivo) &&
      (filtroMaquina === "" || c.machine_id === filtroMaquina)
  );
  const visibles = delCorteYMaquina.filter((c) => estadoActivo === "todos" || c.estado === estadoActivo);
  const porAprobarEnFiltro = delCorteYMaquina.filter((c) => c.estado === "Pendiente").length;

  // Totales por máquina: solo cuentan los conduces aprobados.
  const totales = useMemo(() => {
    const t = new Map<string, { nombre: string; horas: number; cuantos: number; sinFirma: number }>();
    delCorteYMaquina.filter((c) => c.estado === "Aprobado").forEach((c) => {
      const nombre = c.machines?.nombre ?? "Máquina";
      const x = t.get(c.machine_id) ?? { nombre, horas: 0, cuantos: 0, sinFirma: 0 };
      x.horas += Number(c.horas_cobrables);
      x.cuantos += 1;
      if (!c.firmado) x.sinFirma += 1;
      t.set(c.machine_id, x);
    });
    return [...t.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [delCorteYMaquina]);

  return (
    <main className="wrap">
      <Nav activa="conduces" />
      <div className="top">
        <h1>Conduces</h1>
        <button className="btn primary" onClick={() => setEditando(null)}>
          + Nuevo
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="grid2">
        <div className="field">
          <label htmlFor="f-corte">Corte</label>
          <select id="f-corte" value={corteActivo} onChange={(e) => setFiltroCorte(e.target.value)}>
            <option value="todos">Todos</option>
            {cortes.map((c) => (
              <option key={c.clave} value={c.clave}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-maq">Máquina</label>
          <select id="f-maq" value={filtroMaquina} onChange={(e) => setFiltroMaquina(e.target.value)}>
            <option value="">Todas</option>
            {maquinas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        {(
          [
            ["Pendiente", `Por aprobar (${pendientes})`],
            ["Aprobado", "Aprobados"],
            ["Rechazado", `Rechazados (${rechazados})`],
            ["todos", "Todos"],
          ] as [EstadoConduce | "todos", string][]
        ).map(([valor, texto]) => (
          <button
            key={valor}
            className={estadoActivo === valor ? "tab on" : "tab"}
            onClick={() => setFiltroEstado(valor)}
          >
            {texto}
          </button>
        ))}
      </div>
      {estadoActivo !== "Pendiente" && porAprobarEnFiltro > 0 && (
        <div className="aviso" style={{ marginBottom: 12 }}>
          Hay {porAprobarEnFiltro} conduce(s) por aprobar en este filtro. No suman en los totales hasta que los apruebes.
        </div>
      )}

      {totales.length > 0 && (
        <div className="totales">
          {totales.map((t) => (
            <div className="total" key={t.nombre}>
              <div className="total-n">{t.nombre}</div>
              <div className="total-h">{fmtNum(t.horas, 2)} h</div>
              <div className="total-c">
                {t.cuantos} {t.cuantos === 1 ? "conduce" : "conduces"}
                {t.sinFirma > 0 ? ` · ${t.sinFirma} sin firma` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && !error && visibles.length === 0 && (
        <div className="empty">No hay conduces en este filtro.</div>
      )}

      {visibles.map((c) => {
        const desfase = !c.firmado && noCuadra(Number(c.horas_calculadas), c.horas_escritas);
        const sub = [fmtFecha(c.fecha), c.clients?.nombre, c.zona || c.obra, c.creador?.nombre ? `Operador: ${c.creador.nombre}` : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <button key={c.id} className="card" onClick={() => setEditando(c)}>
            <div className="row">
              <div>
                <h2>
                  {c.libreta} #{c.numero} · {c.machines?.nombre ?? "Máquina"}
                </h2>
                <span className={c.estado === "Aprobado" ? "pill disp" : c.estado === "Rechazado" ? "pill taller" : "pill obra"}>
                  {c.estado === "Pendiente" ? "Por aprobar" : c.estado}
                </span>
                <span className={c.firmado ? "pill disp" : "pill taller"} style={{ marginLeft: 6 }}>
                  {c.firmado ? "Firmado" : "Sin firma"}
                </span>
                {c.foto_path && <span className="pill obra" style={{ marginLeft: 6 }}>Con foto</span>}
              </div>
              <div className="horas">
                {fmtNum(Number(c.horas_cobrables), 2)}
                <small> h</small>
              </div>
            </div>
            <div className="line">{sub}</div>
            {!c.firmado && c.foto_firmada_path && (
              <div className="aviso">El operador subió el conduce firmado: revísalo.</div>
            )}
            {c.estado === "Rechazado" && c.motivo_rechazo && <div className="line">Motivo: {c.motivo_rechazo}</div>}
            {desfase && (
              <div className="alerta" style={{ marginTop: 8 }}>
                No cuadra: los tramos dan {fmtNum(Number(c.horas_calculadas), 2)} h y el operador escribió{" "}
                {fmtNum(c.horas_escritas ?? 0, 2)} h.
              </div>
            )}
          </button>
        );
      })}

      {editando !== undefined && (
        <ConduceEditor
          conduce={editando}
          maquinas={maquinas}
          clientes={clientes}
          todos={conduces}
          onClose={() => setEditando(undefined)}
          onSaved={() => {
            setEditando(undefined);
            cargar();
          }}
        />
      )}
    </main>
  );
}
