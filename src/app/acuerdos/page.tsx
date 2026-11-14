"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import AcuerdoEditor from "@/components/AcuerdoEditor";
import { fmtMonto, fmtNum, fmtTarifa, hoyRD, type Acuerdo, type Machine } from "@/lib/machines";
import { aParte, aTrabajo, type Parte, type Trabajo } from "@/lib/trabajos";
import { corteDe, fmtFecha, type Cliente } from "@/lib/conduces";
import { claveCorte } from "@/lib/corte";

export default function AcuerdosPage() {
  const [acuerdos, setAcuerdos] = useState<Acuerdo[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
  const [partes, setPartes] = useState<Parte[]>([]);
  // Conduces aprobados que se cobran por hora (los de piscinas a precio cerrado no cuentan aquí).
  const [conduces, setConduces] = useState<{ machine_id: string; fecha: string; horas: number }[]>([]);
  const router = useRouter();
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = editor cerrado, null = acuerdo nuevo, Acuerdo = editando
  const [editando, setEditando] = useState<Acuerdo | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [a, m, c, tj, pt, cd] = await Promise.all([
      supabase.from("acuerdos").select("*, machines(nombre), clients(nombre)"),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("clients").select("id, nombre, rnc").order("nombre"),
      supabase.from("trabajos").select("*").order("created_at", { ascending: false }),
      supabase.from("trabajo_partes").select("*").order("orden"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables").eq("estado", "Aprobado").is("parte_id", null),
    ]);
    const fallo = a.error ?? m.error ?? c.error ?? tj.error ?? pt.error ?? cd.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setAcuerdos(((a.data ?? []) as unknown as Acuerdo[]).map((x) => ({ ...x, tarifa: Number(x.tarifa) })));
      setMaquinas((m.data ?? []) as Machine[]);
      setClientes((c.data ?? []) as Cliente[]);
      setTrabajos((tj.data ?? []).map(aTrabajo));
      setPartes((pt.data ?? []).map(aParte));
      setConduces(
        (cd.data ?? []).map((x: { machine_id: string; fecha: string; horas_cobrables: number | string }) => ({
          machine_id: x.machine_id,
          fecha: x.fecha,
          horas: Number(x.horas_cobrables),
        }))
      );
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
        // Todo lo generado en este acuerdo, de principio a fin, repartido por corte (cada corte va del 26 al 25).
        const porCorte = new Map<string, { etiqueta: string; horas: number }>();
        for (const c of conduces) {
          if (c.machine_id !== a.machine_id || c.fecha < a.fecha_inicio || (a.fecha_fin != null && c.fecha > a.fecha_fin)) continue;
          const clave = claveCorte(c.fecha, a);
          const incluyeAnteriores = a.corte_inicial === clave && corteDe(a.fecha_inicio).clave < clave;
          const etiqueta = corteDe(clave).etiqueta + (incluyeAnteriores ? ` (incluye desde el ${fmtFecha(a.fecha_inicio)})` : "");
          const previo = porCorte.get(clave) ?? { etiqueta, horas: 0 };
          previo.horas += c.horas;
          porCorte.set(clave, previo);
        }
        const cortes = [...porCorte.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([, v]) => v);
        const horasTotal = cortes.reduce((acc, v) => acc + v.horas, 0);
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
            {horasTotal > 0 && (
              <div className="resumen" style={{ marginTop: 8, fontSize: 14 }}>
                <div>
                  <b>Generado en total:</b> {fmtNum(horasTotal, 2)} h = <b>{fmtMonto(horasTotal * a.tarifa, a.moneda)}</b>
                </div>
                {cortes.map((v) => (
                  <div className="line" key={v.etiqueta}>
                    {v.etiqueta}: {fmtNum(v.horas, 2)} h = {fmtMonto(v.horas * a.tarifa, a.moneda)}
                  </div>
                ))}
                <div className="hint">Horas aprobadas por la tarifa, sin descontar el combustible que dio el cliente.</div>
              </div>
            )}
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
