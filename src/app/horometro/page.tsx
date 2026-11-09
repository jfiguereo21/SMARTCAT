"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import { fmtNum } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { cuadreMaquina, puntosAprobados, type TramoCuadre } from "@/lib/horometro";

type MaquinaFila = { id: string; nombre: string; horometro: number | null; consumo_esperado: number | null };
type ConduceFila = { id: string; machine_id: string; fecha: string; horas: number; estado: string; horometro: number | null };
type CargaFila = { machine_id: string; fecha: string; galones: number };

const TRAMOS_POR_MAQUINA = 4;

function textoTramo(t: TramoCuadre): { texto: string; alerta: boolean } {
  switch (t.nivel) {
    case "conduce_mayor":
      return { alerta: true, texto: `Se cobraron ${fmtNum(t.horasConduce - t.horasHorometro, 1)} h más de lo que marcó el horómetro. Revisa los conduces de esos días.` };
    case "horometro_mayor":
      return { alerta: true, texto: `El motor trabajó ${fmtNum(t.diferencia, 1)} h más de lo que se cobró. Puede haber trabajo sin conduce, o la máquina prendida sin trabajar.` };
    case "sin_movimiento":
      return { alerta: true, texto: "El horómetro no avanzó entre las dos lecturas." };
    case "retroceso":
      return { alerta: true, texto: "El horómetro marca menos que la lectura anterior. Revisa las fotos de esos dos conduces." };
    default:
      return { alerta: false, texto: "Cuadra: las horas del horómetro y las de los conduces están cerca." };
  }
}

export default function HorometroPage() {
  const [maquinas, setMaquinas] = useState<MaquinaFila[]>([]);
  const [conduces, setConduces] = useState<ConduceFila[]>([]);
  const [cargas, setCargas] = useState<CargaFila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [m, c, f] = await Promise.all([
      supabase.from("machines").select("id, nombre, horometro, consumo_esperado").order("nombre"),
      supabase.from("conduces").select("id, machine_id, fecha, horas_cobrables, estado, horometro").in("estado", ["Aprobado", "Pendiente"]),
      supabase.from("fuel_logs").select("machine_id, fecha, galones").eq("estado", "Aprobado"),
    ]);
    const fallo = m.error ?? c.error ?? f.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setMaquinas(
        (m.data ?? []).map((x: Record<string, unknown>) => ({
          id: String(x.id),
          nombre: String(x.nombre),
          horometro: x.horometro == null ? null : Number(x.horometro),
          consumo_esperado: x.consumo_esperado == null ? null : Number(x.consumo_esperado),
        }))
      );
      setConduces(
        (c.data ?? []).map((x: Record<string, unknown>) => ({
          id: String(x.id),
          machine_id: String(x.machine_id),
          fecha: String(x.fecha),
          horas: Number(x.horas_cobrables),
          estado: String(x.estado),
          horometro: x.horometro == null ? null : Number(x.horometro),
        }))
      );
      setCargas((f.data ?? []).map((x: Record<string, unknown>) => ({ machine_id: String(x.machine_id), fecha: String(x.fecha), galones: Number(x.galones) })));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cuadres = useMemo(
    () =>
      maquinas
        .map((m) => {
          const puntos = puntosAprobados(conduces, m.id);
          const tramos = cuadreMaquina(
            puntos,
            conduces.filter((c) => c.machine_id === m.id).map((c) => ({ fecha: c.fecha, horas: c.horas, aprobado: c.estado === "Aprobado" })),
            cargas.filter((c) => c.machine_id === m.id),
            m.consumo_esperado
          );
          const ultima = puntos[puntos.length - 1] ?? null;
          const porAprobar = conduces.filter((c) => c.machine_id === m.id && c.estado === "Pendiente" && c.horometro != null).length;
          return { m, puntos: puntos.length, ultima, porAprobar, tramos: tramos.reverse().slice(0, TRAMOS_POR_MAQUINA) };
        })
        .filter((x) => x.puntos > 0 || x.porAprobar > 0),
    [maquinas, conduces, cargas]
  );

  return (
    <main className="wrap">
      <Nav activa="horometro" />
      <div className="top">
        <h1>Horómetro</h1>
      </div>
      <div className="hint" style={{ marginBottom: 12 }}>
        El operador anota el horómetro con su foto en el reporte del día. Lo revisas y lo corriges en Conduces, al aprobar.
        Aquí se compara, entre cada dos días con lectura aprobada, las horas del horómetro con las de los conduces
        aprobados y el combustible.
      </div>

      {error && <div className="error">{error}</div>}
      {cargando && <div className="empty">Cargando...</div>}
      {!cargando && !error && cuadres.length === 0 && (
        <div className="empty">Todavía no hay conduces aprobados con horómetro para comparar.</div>
      )}

      {cuadres.map(({ m, ultima, tramos, puntos, porAprobar }) => (
        <div className="card" key={m.id} style={{ cursor: "default" }}>
          <div className="row">
            <h2>{m.nombre}</h2>
            {ultima && (
              <div className="line" style={{ margin: 0, textAlign: "right" }}>
                Última: {fmtNum(ultima.lectura, 1)} h
                <br />
                {fmtFecha(ultima.fecha)}
              </div>
            )}
          </div>
          {porAprobar > 0 && (
            <div className="aviso" style={{ marginTop: 6 }}>
              {porAprobar === 1 ? "1 conduce con horómetro espera" : `${porAprobar} conduces con horómetro esperan`} tu aprobación.
            </div>
          )}
          {puntos < 2 && (
            <div className="hint">Falta otro día con horómetro aprobado para poder comparar. El primero sirve de punto de partida.</div>
          )}
          {tramos.map((t) => {
            const msg = textoTramo(t);
            const consumoRaro = t.consumo.nivel === "alto" || t.consumo.nivel === "bajo";
            return (
              <div key={t.hasta} className="resumen" style={{ marginTop: 8 }}>
                <div>
                  <b>
                    {fmtFecha(t.desde)} → {fmtFecha(t.hasta)}
                  </b>
                </div>
                <div>
                  Horómetro: <b>{fmtNum(t.horasHorometro, 1)} h</b> · Conduces: <b>{fmtNum(t.horasConduce, 1)} h</b>
                  {t.horasConducePendientes > 0 ? ` (+${fmtNum(t.horasConducePendientes, 1)} h por aprobar)` : ""}
                </div>
                <div>
                  Combustible: <b>{fmtNum(t.galones, 1)} gal</b>
                  {t.consumo.gph != null ? ` · ${fmtNum(t.consumo.gph, 2)} gal por hora del horómetro` : ""}
                </div>
                <div className={msg.alerta ? "alerta" : "line"} style={{ marginTop: 6 }}>
                  {msg.texto}
                </div>
                {consumoRaro && t.consumo.desviacion != null && (
                  <div className="alerta" style={{ marginTop: 6 }}>
                    El consumo está {t.consumo.nivel === "alto" ? "por encima" : "por debajo"} de lo normal (
                    {t.consumo.desviacion > 0 ? "+" : ""}
                    {Math.round(t.consumo.desviacion * 100)}%).
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </main>
  );
}
