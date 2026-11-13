"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MachineEditor from "@/components/MachineEditor";
import Nav from "@/components/Nav";
import { aMantenimiento, estadoMantenimiento, horasPorConduces, type ConduceHoras, type Mantenimiento } from "@/lib/mantenimiento";
import {
  acuerdoVigente,
  fmtNum,
  fmtTarifa,
  hoyRD,
  lineaMargen,
  type Acuerdo,
  type Machine,
} from "@/lib/machines";

function clasePill(estado: Machine["estado"]) {
  if (estado === "En obra") return "pill obra";
  if (estado === "En taller") return "pill taller";
  return "pill disp";
}

export default function MaquinasPage() {
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [servicios, setServicios] = useState<Mantenimiento[]>([]);
  const [horasConduces, setHorasConduces] = useState<ConduceHoras[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = editor cerrado, null = máquina nueva, Machine = editando
  const [editando, setEditando] = useState<Machine | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [m, a, sv, cd] = await Promise.all([
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("acuerdos").select("*, clients(nombre)").order("fecha_inicio", { ascending: false }),
      supabase.from("mantenimientos").select("*"),
      supabase.from("conduces").select("machine_id, horas_cobrables").eq("estado", "Aprobado"),
    ]);
    const fallo = m.error ?? a.error;
    if (fallo) setError(`No se pudieron cargar las máquinas: ${fallo.message}`);
    else {
      setError("");
      setMaquinas((m.data ?? []) as Machine[]);
      setServicios((sv.data ?? []).map(aMantenimiento));
      setHorasConduces((cd.data ?? []) as ConduceHoras[]);
      setAcuerdos(
        ((a.data ?? []) as unknown as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <main className="wrap">
      <Nav activa="maquinas" />
      <div className="top">
        <h1>Máquinas</h1>
        <button className="btn primary" onClick={() => setEditando(null)}>
          + Nueva
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && !error && maquinas.length === 0 && (
        <div className="empty">Todavía no hay máquinas. Toca “+ Nueva”.</div>
      )}

      {maquinas.map((m) => {
        const specs = [m.marca, m.modelo].filter(Boolean).join(" ");
        const detalle = [specs, m.anio ? String(m.anio) : null, m.serie].filter(Boolean).join(" · ");
        const acuerdo = acuerdoVigente(acuerdos, m.id, hoyRD());
        const margen = lineaMargen(m, acuerdo);
        const horasMant =
          (m as { mantenimiento_por?: string }).mantenimiento_por === "conduces" ? horasPorConduces(m.id, horasConduces) : m.horometro;
        const mant = estadoMantenimiento(horasMant, servicios.filter((x) => x.machine_id === m.id));
        return (
          <button key={m.id} className="card" onClick={() => setEditando(m)}>
            <div className="row">
              <div>
                <h2>{m.nombre}</h2>
                <span className={clasePill(m.estado)}>
                  {m.estado}
                  {m.estado === "En obra" && m.obra ? ` · ${m.obra}` : ""}
                </span>
              </div>
              <div className="horas">
                {m.horometro == null ? "— " : fmtNum(m.horometro, 1)}
                <small> h</small>
              </div>
            </div>
            {detalle && <div className="line">{detalle}</div>}
            <div className="line">
              {fmtTarifa(acuerdo)}
              {acuerdo?.clients?.nombre ? ` · ${acuerdo.clients.nombre}` : ""}
              {m.propiedad === "Subcontratada" && ` · Subcontratada${m.dueno ? `, de ${m.dueno}` : ""}`}
            </div>
            {margen && <div className="line">{margen}</div>}
            {(mant.nivel === "vencido" || mant.nivel === "proximo" || mant.nivel === "sin_dato") && (
              <div className={mant.nivel === "vencido" ? "alerta" : "aviso"}>
                {mant.resumen} Míralo en Mantenimiento.
              </div>
            )}
            {m.horometro_fecha && (
              <div className="line">Horómetro del {m.horometro_fecha}</div>
            )}
          </button>
        );
      })}

      {editando !== undefined && (
        <MachineEditor
          machine={editando}
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
