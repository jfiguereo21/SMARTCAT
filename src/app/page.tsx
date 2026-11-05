"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MachineEditor from "@/components/MachineEditor";
import Nav from "@/components/Nav";
import { fmtNum, fmtTarifa, lineaMargen, type Machine } from "@/lib/machines";

function clasePill(estado: Machine["estado"]) {
  if (estado === "En obra") return "pill obra";
  if (estado === "En taller") return "pill taller";
  return "pill disp";
}

export default function MaquinasPage() {
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = editor cerrado, null = máquina nueva, Machine = editando
  const [editando, setEditando] = useState<Machine | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data, error: err } = await supabase
      .from("machines")
      .select("*")
      .order("nombre");
    if (err) setError(`No se pudieron cargar las máquinas: ${err.message}`);
    else {
      setError("");
      setMaquinas((data ?? []) as Machine[]);
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
        const margen = lineaMargen(m);
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
              {fmtTarifa(m)}
              {m.propiedad === "Subcontratada" && ` · Subcontratada${m.dueno ? `, de ${m.dueno}` : ""}`}
            </div>
            {margen && <div className="line">{margen}</div>}
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
