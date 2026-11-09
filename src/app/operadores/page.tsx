"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { aNumero, fmtMonto, fmtNum, hoyRD, type Machine } from "@/lib/machines";
import { corteDe, resumenHoras, type Conduce } from "@/lib/conduces";

type Perfil = {
  user_id: string;
  rol: "admin" | "operador";
  nombre: string | null;
  activo: boolean;
  tarifa_hora: number | null;
  paga_desde: string | null;
  dieta_semanal: number;
  combustible_semanal: number;
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
  const [dieta, setDieta] = useState(String(perfil.dieta_semanal ?? 0));
  const [combustible, setCombustible] = useState(String(perfil.combustible_semanal ?? 0));
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
    setGuardando(true);
    const supabase = createClient();
    const { error: e1 } = await supabase
      .from("perfiles")
      .update({
        nombre: nombre.trim(),
        activo,
        tarifa_hora: t,
        paga_desde: pagaDesde === "" ? null : pagaDesde,
        dieta_semanal: di,
        combustible_semanal: co,
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
              <label htmlFor="op-dieta">Dieta por semana (RD$)</label>
              <input id="op-dieta" inputMode="decimal" value={dieta} onChange={(e) => setDieta(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="op-comb">Combustible por semana (RD$)</label>
              <input id="op-comb" inputMode="decimal" value={combustible} onChange={(e) => setCombustible(e.target.value)} />
            </div>
          </div>
          <div className="hint">
            El precio por hora es el que acordaste con el operador. Antes de la fecha "cobra desde" no se le paga nada.
          </div>
        </div>

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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [editando, setEditando] = useState<Perfil | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [p, a, m, c] = await Promise.all([
      supabase
        .from("perfiles")
        .select("user_id, rol, nombre, activo, tarifa_hora, paga_desde, dieta_semanal, combustible_semanal")
        .order("nombre"),
      supabase.from("operador_maquinas").select("user_id, machine_id"),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("creado_por, fecha, estado, horas_cobrables"),
    ]);
    const fallo = p.error ?? a.error ?? m.error ?? c.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setPerfiles(
        ((p.data ?? []) as Perfil[]).map((x) => ({
          ...x,
          tarifa_hora: x.tarifa_hora == null ? null : Number(x.tarifa_hora),
          dieta_semanal: Number(x.dieta_semanal ?? 0),
          combustible_semanal: Number(x.combustible_semanal ?? 0),
        }))
      );
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

      {operadores.map((o) => {
        const suyas = asignaciones.filter((a) => a.user_id === o.user_id).map((a) => a.machine_id);
        const nombres = suyas.map((id) => maquinas.find((m) => m.id === id)?.nombre).filter(Boolean).join(", ");
        const h = horasDe.get(o.user_id);
        return (
          <button key={o.user_id} className="card" onClick={() => setEditando(o)}>
            <div className="row">
              <div>
                <h2>{o.nombre || "Sin nombre"}</h2>
                <span className={o.activo ? "pill disp" : "pill taller"}>{o.activo ? "Activo" : "Desactivado"}</span>
              </div>
              <div className="horas">
                {fmtNum(h?.aprobadas ?? 0, 2)}
                <small> h aprob.</small>
              </div>
            </div>
            <div className="line">{nombres || "Sin máquinas asignadas"}</div>
            <div className="line">
              {o.tarifa_hora != null ? `${fmtMonto(o.tarifa_hora, "DOP")} por hora` : "Sin precio por hora todavía"}
            </div>
            <div className="line">
              Corte {etiquetaCorte}: {fmtNum(h?.pendientes ?? 0, 2)} h por aprobar
              {h && h.rechazadas > 0 ? ` · ${fmtNum(h.rechazadas, 2)} h rechazadas` : ""}
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
