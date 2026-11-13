"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import FallaEditor from "@/components/FallaEditor";
import ServiciosMaquinas from "@/components/ServiciosMaquinas";
import { fmtFecha } from "@/lib/conduces";
import type { ReporteFalla } from "@/lib/fallas";

type Vista = "servicios" | "abiertas" | "resueltas";

export default function MantenimientoPage() {
  const [reportes, setReportes] = useState<ReporteFalla[]>([]);
  const [maquinas, setMaquinas] = useState<Record<string, string>>({});
  const [operadores, setOperadores] = useState<Record<string, string>>({});
  const [vista, setVista] = useState<Vista>("servicios");
  const [abierto, setAbierto] = useState<ReporteFalla | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [r, m, p] = await Promise.all([
      supabase.from("reportes_falla").select("*").order("created_at", { ascending: false }),
      supabase.from("machines").select("id, nombre"),
      supabase.from("perfiles").select("user_id, nombre"),
    ]);
    const fallo = r.error ?? m.error ?? p.error;
    if (fallo) setError(`No se pudieron cargar los reportes: ${fallo.message}`);
    else {
      setError("");
      setReportes((r.data ?? []) as ReporteFalla[]);
      setMaquinas(Object.fromEntries((m.data ?? []).map((x: { id: string; nombre: string }) => [x.id, x.nombre])));
      setOperadores(Object.fromEntries((p.data ?? []).map((x: { user_id: string; nombre: string | null }) => [x.user_id, x.nombre ?? "Operador"])));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const orden = { Nuevo: 0, Enviado: 1, "En reparación": 2, Resuelto: 3 } as const;
  const lista = useMemo(() => {
    const filtradas = reportes.filter((x) => (vista === "resueltas" ? x.estado === "Resuelto" : x.estado !== "Resuelto"));
    if (vista === "resueltas") return filtradas;
    // Primero lo que no has tomado y lo urgente.
    return [...filtradas].sort(
      (a, b) =>
        orden[a.estado] - orden[b.estado] ||
        (a.urgencia === "Debe parar" ? 0 : 1) - (b.urgencia === "Debe parar" ? 0 : 1) ||
        (a.created_at < b.created_at ? 1 : -1)
    );
  }, [reportes, vista]);

  const nuevas = reportes.filter((x) => x.estado === "Nuevo").length;
  const abiertas = reportes.filter((x) => x.estado !== "Resuelto").length;

  return (
    <main className="wrap">
      <Nav activa="mantenimiento" />
      <div className="top">
        <h1>Mantenimiento</h1>
      </div>

      <div className="tabs" style={{ marginBottom: 12 }}>
        <button className={vista === "servicios" ? "tab on" : "tab"} onClick={() => setVista("servicios")}>
          Cada 250 horas
        </button>
        <button className={vista === "abiertas" ? "tab on" : "tab"} onClick={() => setVista("abiertas")}>
          Fallas ({abiertas})
        </button>
        <button className={vista === "resueltas" ? "tab on" : "tab"} onClick={() => setVista("resueltas")}>
          Resueltas
        </button>
      </div>

      {vista === "servicios" && <ServiciosMaquinas />}

      {nuevas > 0 && vista !== "resueltas" && (
        <div className="alerta" style={{ marginBottom: 12 }}>
          {nuevas === 1 ? "Hay 1 falla nueva sin tomar." : `Hay ${nuevas} fallas nuevas sin tomar.`} Ábrela, mira las fotos y
          el video, y escribe a quién se la mandas.
        </div>
      )}

      {vista !== "servicios" && error && <div className="error">{error}</div>}
      {vista !== "servicios" && cargando && <div className="empty">Cargando...</div>}
      {vista !== "servicios" && !cargando && !error && lista.length === 0 && (
        <div className="empty">{vista === "abiertas" ? "No hay fallas abiertas." : "Todavía no hay fallas resueltas."}</div>
      )}

      {vista !== "servicios" && lista.map((x) => (
        <button key={x.id} className="card" onClick={() => setAbierto(x)}>
          <div className="row">
            <div>
              <h2>{maquinas[x.machine_id] ?? "Máquina"}</h2>
              <span className={x.estado === "Resuelto" ? "pill disp" : x.estado === "Nuevo" ? "pill obra" : "pill taller"}>
                {x.estado === "Nuevo" ? "Nueva" : x.estado}
              </span>
              {x.urgencia === "Debe parar" && (
                <span className="pill taller" style={{ marginLeft: 6 }}>
                  Debe parar
                </span>
              )}
            </div>
          </div>
          <div className="line">{x.descripcion.length > 120 ? `${x.descripcion.slice(0, 120)}…` : x.descripcion}</div>
          <div className="line">
            {fmtFecha(x.fecha)} · {operadores[x.creado_por] ?? "Operador"} · {x.fotos.length}{" "}
            {x.fotos.length === 1 ? "foto" : "fotos"}
            {x.video_path ? " · video" : ""}
            {x.asignado_a ? ` · con ${x.asignado_a}` : ""}
          </div>
        </button>
      ))}

      {abierto && (
        <FallaEditor
          key={abierto.id}
          reporte={abierto}
          maquina={maquinas[abierto.machine_id] ?? "Máquina"}
          operador={operadores[abierto.creado_por] ?? "Operador"}
          onClose={() => setAbierto(null)}
          onSaved={() => {
            setAbierto(null);
            cargar();
          }}
        />
      )}
    </main>
  );
}
