"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import AcuerdoEditor from "@/components/AcuerdoEditor";
import { fmtMonto, fmtTarifa, hoyRD, type Acuerdo, type Machine } from "@/lib/machines";
import { aParte, aTrabajo, type Parte, type Trabajo } from "@/lib/trabajos";
import { fmtFecha, type Cliente } from "@/lib/conduces";

export default function AcuerdosPage() {
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = editor cerrado, null = acuerdo nuevo, Acuerdo = editando
  const [editando, setEditando] = useState<Acuerdo | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [a, m, c, tj, pt] = await Promise.all([
      supabase.from("acuerdos").select("*, machines(nombre), clients(nombre)"),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("clients").select("id, nombre, rnc").order("nombre"),
      supabase.from("trabajos").select("*").order("created_at", { ascending: false }),
      supabase.from("trabajo_partes").select("*").order("orden"),
    ]);
    const fallo = a.error ?? m.error ?? c.error ?? tj.error ?? pt.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setAcuerdos(((a.data ?? []) as unknown as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
      setMaquinas((m.data ?? []) as Machine[]);
      setClientes((c.data ?? []) as Cliente[]);
      setTrabajos((tj.data ?? []).map(aTrabajo));
      setPartes((pt.data ?? []).map(aParte));
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

  const trabajosAbiertos = trabajos.filter((t) => t.estado === "Abierto");
  // Una máquina con un trabajo a precio cerrado abierto no necesita acuerdo por hora.
  const maquinasSinAcuerdo = maquinas.filter(
    (m) =>
      !acuerdos.some((a) => a.machine_id === m.id && a.fecha_inicio <= hoy && (a.fecha_fin == null || a.fecha_fin >= hoy)) &&
      !trabajosAbiertos.some((t) => t.machine_id === m.id)
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

      {trabajos.map((t) => {
        const ps = partes.filter((p) => p.trabajo_id === t.id);
        const hechas = ps.filter((p) => p.terminada_en).length;
        const total = ps.reduce((acc, p) => acc + p.precio, 0);
        const cli = clientes.find((c) => c.id === t.client_id)?.nombre;
        return (
          <button key={t.id} className="card" onClick={() => router.push(`/trabajos?abrir=${t.id}`)}>
            <div className="row">
              <div>
                <h2>{maquinas.find((m) => m.id === t.machine_id)?.nombre ?? "Máquina"}</h2>
                <span className={t.estado === "Abierto" ? "pill obra" : "pill taller"}>
                  {t.estado === "Abierto" ? "Por ajuste · Vigente" : "Por ajuste · Cerrado"}
                </span>
              </div>
              <div className="horas" style={{ fontSize: 22 }}>
                {fmtMonto(total, "DOP")}
              </div>
            </div>
            <div className="line">{[t.nombre, cli, t.obra].filter(Boolean).join(" · ")}</div>
            <div className="line">
              Desde {fmtFecha(t.fecha_inicio)} · {hechas} de {ps.length} terminadas · precio cerrado, no por hora
            </div>
          </button>
        );
      })}

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
