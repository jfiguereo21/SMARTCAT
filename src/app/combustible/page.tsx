"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import FuelEditor from "@/components/FuelEditor";
import { fmtMonto, fmtNum, hoyRD, type Machine } from "@/lib/machines";
import { corteDe, fmtFecha } from "@/lib/conduces";
import { redondear2, sumarCargas, type FuelLog } from "@/lib/combustible";

type ConduceLigero = { machine_id: string; fecha: string; horas_cobrables: number };

function textoGasto(t: { DOP: number; USD: number }): string {
  const partes: string[] = [];
  if (t.DOP > 0) partes.push(fmtMonto(t.DOP, "DOP"));
  if (t.USD > 0) partes.push(fmtMonto(t.USD, "USD"));
  return partes.length > 0 ? partes.join(" + ") : "RD$0.00";
}

export default function CombustiblePage() {
  const [cargas, setCargas] = useState<FuelLog[]>([]);
  const [maquinas, setMaquinas] = useState<Machine[]>([]);
  const [conduces, setConduces] = useState<ConduceLigero[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtroCorte, setFiltroCorte] = useState<string | null>(null);
  // undefined = editor cerrado, null = carga nueva, FuelLog = editando
  const [editando, setEditando] = useState<FuelLog | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [f, m, c] = await Promise.all([
      supabase
        .from("fuel_logs")
        .select("*, machines(nombre)")
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("machines").select("*").order("nombre"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables"),
    ]);
    const fallo = f.error ?? m.error ?? c.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setCargas(
        ((f.data ?? []) as unknown as FuelLog[]).map((x) => ({
          ...x,
          galones: Number(x.galones),
          precio_galon: Number(x.precio_galon),
          monto: Number(x.monto),
        }))
      );
      setMaquinas((m.data ?? []) as Machine[]);
      setConduces(
        ((c.data ?? []) as ConduceLigero[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) }))
      );
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Cortes que existen en los datos (más el de hoy), el más reciente primero.
  const cortes = useMemo(() => {
    const mapa = new Map<string, string>();
    const sumar = (fecha: string) => {
      const k = corteDe(fecha);
      mapa.set(k.clave, k.etiqueta);
    };
    cargas.forEach((x) => sumar(x.fecha));
    sumar(hoyRD());
    return [...mapa.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([clave, etiqueta]) => ({ clave, etiqueta }));
  }, [cargas]);

  // Al abrir: el corte más reciente que tiene cargas; si no hay ninguna, el de hoy.
  const corteActivo =
    filtroCorte ??
    (cargas[0] ? corteDe(cargas[0].fecha).clave : corteDe(hoyRD()).clave);

  const cargasDelCorte = cargas.filter((x) => corteDe(x.fecha).clave === corteActivo);
  const conducesDelCorte = conduces.filter((x) => corteDe(x.fecha).clave === corteActivo);
  const totalCorte = sumarCargas(cargasDelCorte);

  const porMaquina = useMemo(() => {
    return maquinas
      .map((m) => {
        const susCargas = cargasDelCorte.filter((c) => c.machine_id === m.id);
        const horas = redondear2(
          conducesDelCorte.filter((c) => c.machine_id === m.id).reduce((a, c) => a + c.horas_cobrables, 0)
        );
        return { m, t: sumarCargas(susCargas), cuantas: susCargas.length, horas };
      })
      .filter((x) => x.cuantas > 0);
  }, [maquinas, cargasDelCorte, conducesDelCorte]);

  return (
    <main className="wrap">
      <Nav activa="combustible" />
      <div className="top">
        <h1>Combustible</h1>
        <button className="btn primary" onClick={() => setEditando(null)}>
          + Carga
        </button>
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        El combustible es un gasto tuyo: anota los galones y lo que pagaste por galón.
      </div>

      {error && <div className="error">{error}</div>}

      <div className="field">
        <label htmlFor="cb-corte">Corte</label>
        <select id="cb-corte" value={corteActivo} onChange={(e) => setFiltroCorte(e.target.value)}>
          {cortes.map((c) => (
            <option key={c.clave} value={c.clave}>
              {c.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {cargasDelCorte.length > 0 && (
        <div className="total" style={{ marginBottom: 12 }}>
          <div className="total-n">Gasto de combustible del corte</div>
          <div className="total-h">{textoGasto(totalCorte)}</div>
          <div className="total-c">{fmtNum(totalCorte.galones, 2)} galones</div>
        </div>
      )}

      {porMaquina.length > 0 && (
        <div className="totales">
          {porMaquina.map(({ m, t, horas }) => (
            <div className="total" key={m.id}>
              <div className="total-n">{m.nombre}</div>
              <div className="total-h" style={{ fontSize: 18 }}>
                {textoGasto(t)}
              </div>
              <div className="total-c">
                {fmtNum(t.galones, 2)} gal
                {horas > 0 ? ` · ${fmtNum(horas, 2)} h · ${fmtNum(t.galones / horas, 2)} gal/h` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && !error && cargasDelCorte.length === 0 && (
        <div className="empty">No hay cargas en este corte. Toca “+ Carga”.</div>
      )}

      {cargasDelCorte.map((x) => (
        <button key={x.id} className="card" onClick={() => setEditando(x)}>
          <div className="row">
            <div>
              <h2>{x.machines?.nombre ?? "Máquina"}</h2>
              <div className="line">{[fmtFecha(x.fecha), x.nota].filter(Boolean).join(" · ")}</div>
              <div className="line">
                {fmtNum(x.galones, 2)} gal × {fmtMonto(x.precio_galon, x.moneda)}
              </div>
            </div>
            <div className="horas" style={{ fontSize: 22 }}>
              {fmtMonto(x.monto, x.moneda)}
            </div>
          </div>
        </button>
      ))}

      {editando !== undefined && (
        <FuelEditor
          carga={editando}
          maquinas={maquinas}
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
