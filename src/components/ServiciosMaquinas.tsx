"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtNum, hoyRD } from "@/lib/machines";
import { fmtFecha } from "@/lib/conduces";
import {
  aMantenimiento,
  estadoMantenimiento,
  INTERVALO_MANTENIMIENTO,
  ordenNivel,
  type Mantenimiento,
} from "@/lib/mantenimiento";

type Maq = { id: string; nombre: string; horometro: number | null; horometro_fecha: string | null };

const pillDe = { vencido: "pill taller", proximo: "pill obra", al_dia: "pill disp", sin_dato: "pill obra" } as const;
const textoPill = { vencido: "Le toca mantenimiento", proximo: "Ya viene", al_dia: "Al día", sin_dato: "Falta un dato" } as const;

// Mantenimiento cada 250 horas de trabajo, según el horómetro de cada máquina.
export default function ServiciosMaquinas() {
  const [maquinas, setMaquinas] = useState<Maq[]>([]);
  const [servicios, setServicios] = useState<Mantenimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [registrando, setRegistrando] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoyRD());
  const [horas, setHoras] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState("");
  const [historial, setHistorial] = useState<string | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const [m, s] = await Promise.all([
      supabase.from("machines").select("id, nombre, horometro, horometro_fecha").order("nombre"),
      supabase.from("mantenimientos").select("*").order("horometro", { ascending: false }),
    ]);
    const fallo = m.error ?? s.error;
    if (fallo) setError(`No se pudo cargar el mantenimiento: ${fallo.message}`);
    else {
      setError("");
      setMaquinas(
        (m.data ?? []).map((x: Record<string, unknown>) => ({
          id: String(x.id),
          nombre: String(x.nombre),
          horometro: x.horometro == null ? null : Number(x.horometro),
          horometro_fecha: (x.horometro_fecha as string | null) ?? null,
        }))
      );
      setServicios((s.data ?? []).map(aMantenimiento));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = useMemo(
    () =>
      maquinas
        .map((m) => {
          const propios = servicios.filter((s) => s.machine_id === m.id);
          return { m, propios, e: estadoMantenimiento(m.horometro, propios) };
        })
        .sort((a, b) => ordenNivel[a.e.nivel] - ordenNivel[b.e.nivel] || a.m.nombre.localeCompare(b.m.nombre)),
    [maquinas, servicios]
  );

  function abrirRegistro(m: Maq) {
    setRegistrando(m.id);
    setFecha(hoyRD());
    setHoras(m.horometro != null ? String(m.horometro) : "");
    setNota("");
    setErrorForm("");
  }

  async function guardar(m: Maq) {
    const h = Number(horas.replace(",", "."));
    if (horas.trim() === "" || !Number.isFinite(h) || h < 0) return setErrorForm("Escribe las horas que marcaba el horómetro.");
    if (!fecha) return setErrorForm("Escribe la fecha.");
    setGuardando(true);
    setErrorForm("");
    const { error: e } = await createClient()
      .from("mantenimientos")
      .insert({ machine_id: m.id, fecha, horometro: h, nota: nota.trim() || null });
    setGuardando(false);
    if (e) return setErrorForm(`No se pudo guardar: ${e.message}`);
    setRegistrando(null);
    cargar();
  }

  async function quitar(id: string) {
    if (quitando !== id) return setQuitando(id);
    const { error: e } = await createClient().from("mantenimientos").delete().eq("id", id);
    setQuitando(null);
    if (e) return setError(`No se pudo quitar: ${e.message}`);
    cargar();
  }

  if (cargando) return <div className="empty">Cargando...</div>;

  return (
    <>
      <div className="hint" style={{ marginBottom: 12 }}>
        Cada máquina se revisa cada {INTERVALO_MANTENIMIENTO} horas de trabajo, según lo que marca su horómetro. Cuando le des
        un mantenimiento, regístralo aquí con las horas que tenía, y la app cuenta desde ahí.
      </div>
      {error && <div className="error">{error}</div>}

      {filas.map(({ m, propios, e }) => (
        <div key={m.id} className="card" style={{ cursor: "default" }}>
          <div className="row">
            <div>
              <h2>{m.nombre}</h2>
              <span className={pillDe[e.nivel]}>{textoPill[e.nivel]}</span>
            </div>
            <div className="horas">
              {m.horometro == null ? "— " : fmtNum(m.horometro, 1)}
              <small> h</small>
            </div>
          </div>

          <div style={{ marginTop: 8, fontWeight: 600 }}>{e.resumen}</div>

          {e.proximoEn != null && (
            <>
              <div
                style={{ background: "var(--line)", borderRadius: 999, height: 10, marginTop: 8, overflow: "hidden" }}
                aria-hidden
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(0, e.avance * 100))}%`,
                    height: "100%",
                    background: e.nivel === "vencido" ? "var(--danger)" : e.nivel === "proximo" ? "var(--taller)" : "var(--ok)",
                  }}
                />
              </div>
              <div className="line">
                {e.ultimo
                  ? `Último mantenimiento: a las ${fmtNum(e.ultimo.horometro, 1)} h (${fmtFecha(e.ultimo.fecha)}).`
                  : "Todavía no se le ha registrado ningún mantenimiento; cuenta desde 0 horas."}{" "}
                Le toca a las {fmtNum(e.proximoEn, 1)} h.
              </div>
            </>
          )}
          {m.horometro_fecha && <div className="line">Horómetro del {fmtFecha(m.horometro_fecha)}</div>}

          {registrando === m.id ? (
            <div style={{ marginTop: 12 }}>
              <label htmlFor={`mf-${m.id}`}>Fecha del mantenimiento</label>
              <input id={`mf-${m.id}`} type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
              <label htmlFor={`mh-${m.id}`}>Horas que marcaba el horómetro</label>
              <input
                id={`mh-${m.id}`}
                inputMode="decimal"
                value={horas}
                onChange={(ev) => setHoras(ev.target.value)}
                placeholder="Ej: 262.6"
              />
              <label htmlFor={`mn-${m.id}`}>Qué se le hizo (opcional)</label>
              <input
                id={`mn-${m.id}`}
                value={nota}
                onChange={(ev) => setNota(ev.target.value)}
                placeholder="Ej: aceite, filtros, grasa"
              />
              {errorForm && <div className="error">{errorForm}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn primary" disabled={guardando} onClick={() => guardar(m)}>
                  {guardando ? "Guardando..." : "Guardar"}
                </button>
                <button className="btn" onClick={() => setRegistrando(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button className="btn primary" onClick={() => abrirRegistro(m)}>
                Le di mantenimiento
              </button>
              {propios.length > 0 && (
                <button className="btn" onClick={() => setHistorial(historial === m.id ? null : m.id)}>
                  {historial === m.id ? "Ocultar historial" : `Historial (${propios.length})`}
                </button>
              )}
            </div>
          )}

          {historial === m.id &&
            propios.map((s) => (
              <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", marginTop: 8 }}>
                <div className="row">
                  <span>
                    <b>{fmtNum(s.horometro, 1)} h</b> · {fmtFecha(s.fecha)}
                    {s.nota ? <div className="line">{s.nota}</div> : null}
                  </span>
                  <button className={quitando === s.id ? "btn small danger armed" : "btn small danger"} onClick={() => quitar(s.id)}>
                    {quitando === s.id ? "Toca otra vez" : "Quitar"}
                  </button>
                </div>
              </div>
            ))}
        </div>
      ))}
    </>
  );
}
