"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import AcuerdoEditor from "@/components/AcuerdoEditor";
import { fmtTarifa, hoyRD, type Acuerdo, type Machine } from "@/lib/machines";
import { fmtFecha, type Cliente } from "@/lib/conduces";

export default function AcuerdosPage() {
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = editor cerrado, null = acuerdo nuevo, Acuerdo = editando
  const [editando, setEditando] = useState<Acuerdo | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [a, m, c] = await Promise.all([
      supabase.from("acuerdos").select("*, machines(nombre), clients(nombre)"),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("clients").select("id, nombre, rnc").order("nombre"),
    ]);
    const fallo = a.error ?? m.error ?? c.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setAcuerdos(((a.data ?? []) as unknown as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
      setMaquinas((m.data ?? []) as Machine[]);
      setClientes((c.data ?? []) as Cliente[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hoy = hoyRD();
  // Por máquina; dentro de cada una, el más reciente primero.
  const ordenados = [...acuerdos].sort((x, y) => {
    const nx = x.machines?.nombre ?? "";
    const ny = y.machines?.nombre ?? "";
    if (nx !== ny) return nx.localeCompare(ny);
    return x.fecha_inicio < y.fecha_inicio ? 1 : -1;
  });

  const maquinasSinAcuerdo = maquinas.filter(
    (m) => !acuerdos.some((a) => a.machine_id === m.id && a.fecha_inicio <= hoy && (a.fecha_fin == null || a.fecha_fin >= hoy))
  );

  return (
    <main className="wrap">
      <Nav activa="acuerdos" />
      <div className="top">
        <h1>Acuerdos</h1>
        <button className="btn primary" onClick={() => setEditando(null)}>
          + Nuevo
        </button>
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        Aquí pones lo pactado cada vez que una máquina se alquila: cliente, lugar, moneda y tarifa por hora.
        Si la mueves a otro cliente, crea un acuerdo nuevo.
      </div>

      {error && <div className="error">{error}</div>}
      {cargando && <div className="empty">Cargando...</div>}

      {!cargando && maquinasSinAcuerdo.length > 0 && (
        <div className="aviso" style={{ marginBottom: 12 }}>
          Sin acuerdo vigente hoy: {maquinasSinAcuerdo.map((m) => m.nombre).join(", ")}.
        </div>
      )}

      {!cargando && !error && ordenados.length === 0 && (
        <div className="empty">Todavía no hay acuerdos. Toca “+ Nuevo”.</div>
      )}

      {ordenados.map((a) => {
        const vigente = a.fecha_inicio <= hoy && (a.fecha_fin == null || a.fecha_fin >= hoy);
        const futuro = a.fecha_inicio > hoy;
        const sub = [a.clients?.nombre, a.obra].filter(Boolean).join(" · ");
        return (
          <button key={a.id} className="card" onClick={() => setEditando(a)}>
            <div className="row">
              <div>
                <h2>{a.machines?.nombre ?? "Máquina"}</h2>
                <span className={vigente ? "pill disp" : futuro ? "pill obra" : "pill taller"}>
                  {vigente ? "Vigente" : futuro ? "Por empezar" : "Terminado"}
                </span>
              </div>
              <div className="horas" style={{ fontSize: 22 }}>
                {fmtTarifa(a)}
              </div>
            </div>
            {sub && <div className="line">{sub}</div>}
            <div className="line">
              Desde {fmtFecha(a.fecha_inicio)}
              {a.fecha_fin ? ` hasta ${fmtFecha(a.fecha_fin)}` : ""}
            </div>
            {a.notas && <div className="line">{a.notas}</div>}
          </button>
        );
      })}

      {editando !== undefined && (
        <AcuerdoEditor
          acuerdo={editando}
          maquinas={maquinas}
          clientes={clientes}
          acuerdos={acuerdos}
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
