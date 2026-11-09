"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Nav from "@/components/Nav";
import HorometroEditor from "@/components/HorometroEditor";
import { fmtNum } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import { aLectura, avisosLectura, cuadreMaquina, type LecturaHoro, type TramoCuadre } from "@/lib/horometro";

type MaquinaFila = { id: string; nombre: string; horometro: number | null; consumo_esperado: number | null };
type ConduceFila = { machine_id: string; fecha: string; horas_cobrables: number; estado: string };
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
    default:
      return { alerta: false, texto: "Cuadra: las horas del horómetro y las de los conduces están cerca." };
  }
}

export default function HorometroPage() {
  const [lecturas, setLecturas] = useState<LecturaHoro[]>([]);
  const [maquinas, setMaquinas] = useState<MaquinaFila[]>([]);
  const [conduces, setConduces] = useState<ConduceFila[]>([]);
  const [cargas, setCargas] = useState<CargaFila[]>([]);
  const [operadores, setOperadores] = useState<Record<string, string>>({});
  const [abierta, setAbierta] = useState<LecturaHoro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [l, m, c, f, p] = await Promise.all([
      supabase.from("lecturas_horometro").select("*").order("fecha", { ascending: false }),
      supabase.from("machines").select("id, nombre, horometro, consumo_esperado").order("nombre"),
      supabase.from("conduces").select("machine_id, fecha, horas_cobrables, estado").in("estado", ["Aprobado", "Pendiente"]),
      supabase.from("fuel_logs").select("machine_id, fecha, galones").eq("estado", "Aprobado"),
      supabase.from("perfiles").select("user_id, nombre"),
    ]);
    const fallo = l.error ?? m.error ?? c.error ?? f.error ?? p.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setLecturas((l.data ?? []).map(aLectura));
      setMaquinas(
        (m.data ?? []).map((x: Record<string, unknown>) => ({
          id: String(x.id),
          nombre: String(x.nombre),
          horometro: x.horometro == null ? null : Number(x.horometro),
          consumo_esperado: x.consumo_esperado == null ? null : Number(x.consumo_esperado),
        }))
      );
      setConduces((c.data ?? []).map((x: Record<string, unknown>) => ({ ...(x as ConduceFila), horas_cobrables: Number(x.horas_cobrables) })));
      setCargas((f.data ?? []).map((x: Record<string, unknown>) => ({ ...(x as CargaFila), galones: Number(x.galones) })));
      setOperadores(Object.fromEntries((p.data ?? []).map((x: { user_id: string; nombre: string | null }) => [x.user_id, x.nombre ?? "Operador"])));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreMaq = (id: string) => maquinas.find((m) => m.id === id)?.nombre ?? "Máquina";
  const pendientes = lecturas.filter((x) => x.estado === "Pendiente").sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  function avisosDe(x: LecturaHoro) {
    const maq = maquinas.find((m) => m.id === x.machine_id);
    const anterior =
      lecturas
        .filter((y) => y.machine_id === x.machine_id && y.estado === "Aprobado" && y.id !== x.id && y.fecha <= x.fecha)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0] ?? null;
    let entre: { aprobadas: number; pendientes: number } | null = null;
    if (anterior) {
      const dentro = conduces.filter((c) => c.machine_id === x.machine_id && c.fecha > anterior.fecha && c.fecha <= x.fecha);
      entre = {
        aprobadas: dentro.filter((c) => c.estado === "Aprobado").reduce((s, c) => s + c.horas_cobrables, 0),
        pendientes: dentro.filter((c) => c.estado === "Pendiente").reduce((s, c) => s + c.horas_cobrables, 0),
      };
    }
    return avisosLectura(x, anterior, maq?.horometro ?? null, entre);
  }

  const cuadres = useMemo(
    () =>
      maquinas
        .map((m) => {
          const aprobadas = lecturas.filter((x) => x.machine_id === m.id && x.estado === "Aprobado");
          const tramos = cuadreMaquina(
            aprobadas,
            conduces.filter((c) => c.machine_id === m.id).map((c) => ({ fecha: c.fecha, horas: c.horas_cobrables, aprobado: c.estado === "Aprobado" })),
            cargas.filter((c) => c.machine_id === m.id),
            m.consumo_esperado
          );
          const ultima = [...aprobadas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))[0] ?? null;
          return { m, aprobadas: aprobadas.length, ultima, tramos: tramos.reverse().slice(0, TRAMOS_POR_MAQUINA) };
        })
        .filter((x) => x.aprobadas > 0),
    [maquinas, lecturas, conduces, cargas]
  );

  return (
    <main className="wrap">
      <Nav activa="horometro" />
      <div className="top">
        <h1>Horómetro</h1>
      </div>

      {error && <div className="error">{error}</div>}
      {cargando && <div className="empty">Cargando...</div>}

      {!cargando && !error && (
        <>
          <h2 style={{ fontSize: 16, margin: "8px 0" }}>Por aprobar {pendientes.length > 0 ? `(${pendientes.length})` : ""}</h2>
          {pendientes.length === 0 && <div className="empty">No hay lecturas esperando aprobación.</div>}
          {pendientes.map((x) => {
            const av = avisosDe(x);
            const hayAlerta = av.some((a) => a.alerta);
            return (
              <button key={x.id} className="card" onClick={() => setAbierta(x)}>
                <div className="row">
                  <div>
                    <h2>{nombreMaq(x.machine_id)}</h2>
                    <span className="pill obra">Por aprobar</span>
                  </div>
                  <div className="horas">
                    {fmtNum(x.lectura, 1)}
                    <small> h</small>
                  </div>
                </div>
                <div className="line">
                  {fmtFecha(x.fecha)} · {operadores[x.creado_por] ?? "Operador"}
                </div>
                {hayAlerta && <div className="alerta">Tiene avisos. Ábrela para revisarla.</div>}
              </button>
            );
          })}

          <h2 style={{ fontSize: 16, margin: "20px 0 4px" }}>Cuadre por máquina</h2>
          <div className="hint" style={{ marginBottom: 8 }}>
            Compara, entre cada dos lecturas aprobadas, las horas del horómetro con las de los conduces aprobados y el
            combustible. Las lecturas se toman al terminar el día.
          </div>
          {cuadres.length === 0 && <div className="empty">Todavía no hay lecturas aprobadas para comparar.</div>}
          {cuadres.map(({ m, ultima, tramos, aprobadas }) => (
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
              {aprobadas < 2 && (
                <div className="hint">Falta otra lectura aprobada para poder comparar. Esta sirve de punto de partida.</div>
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
        </>
      )}

      {abierta && (
        <HorometroEditor
          key={abierta.id}
          lectura={abierta}
          maquina={nombreMaq(abierta.machine_id)}
          operador={operadores[abierta.creado_por] ?? "Operador"}
          avisos={avisosDe(abierta)}
          onClose={() => setAbierta(null)}
          onSaved={() => {
            setAbierta(null);
            cargar();
          }}
        />
      )}
    </main>
  );
}
