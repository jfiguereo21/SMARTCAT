"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import OperadorForm, { type MaquinaOperador } from "@/components/OperadorForm";
import FuelOperadorForm from "@/components/FuelOperadorForm";
import MiPago from "@/components/MiPago";
import FallaOperadorForm from "@/components/FallaOperadorForm";
import type { ReporteFalla } from "@/lib/fallas";
import type { FuelLog } from "@/lib/combustible";
import { fmtNum } from "@/lib/machines";
import { fmtFecha, type Conduce } from "@/lib/conduces";

export default function OperadorPage() {
  const [uid, setUid] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [maquinas, setMaquinas] = useState<MaquinaOperador[]>([]);
  const [conduces, setConduces] = useState<Conduce[]>([]);
  const [cargas, setCargas] = useState<FuelLog[]>([]);
  const [fallas, setFallas] = useState<ReporteFalla[]>([]);
  // undefined = cerrado, null = reporte nuevo, ReporteFalla = abierto
  const [falla, setFalla] = useState<ReporteFalla | null | undefined>(undefined);
  const [vista, setVista] = useState<"horas" | "combustible" | "fallas">("horas");
  // undefined = cerrado, null = carga nueva, FuelLog = abierta
  const [gasoil, setGasoil] = useState<FuelLog | null | undefined>(undefined);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = cerrado, null = reporte nuevo, Conduce = abierto
  const [abierto, setAbierto] = useState<Conduce | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setUid(u.user.id);
    const [p, m, c, f, r] = await Promise.all([
      supabase.from("perfiles").select("nombre, rol").eq("user_id", u.user.id).maybeSingle(),
      supabase.from("operador_maquinas").select("machine_id, maquina_nombre").eq("user_id", u.user.id),
      supabase
        .from("conduces")
        .select("*")
        .eq("creado_por", u.user.id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("fuel_logs")
        .select("*")
        .eq("creado_por", u.user.id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("reportes_falla")
        .select("*")
        .eq("creado_por", u.user.id)
        .order("created_at", { ascending: false }),
    ]);
    const fallo = p.error ?? m.error ?? c.error ?? f.error ?? r.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setNombre(p.data?.nombre ?? "");
      setRol(p.data?.rol ?? "");
      setMaquinas((m.data ?? []) as MaquinaOperador[]);
      setConduces(((c.data ?? []) as Conduce[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) })));
      setCargas(((f.data ?? []) as FuelLog[]).map((x) => ({ ...x, galones: Number(x.galones) })));
      setFallas((r.data ?? []) as ReporteFalla[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function salir() {
    await createClient().auth.signOut();
    window.location.href = "/login";
  }


  return (
    <main className="wrap">
      <header className="nav">
        <div>
          <strong>{nombre || "Operador"}</strong>
          <div className="hint" style={{ marginTop: 0 }}>
            SmartCat
          </div>
        </div>
        <div className="who">
          {(rol === "admin" || rol === "socio") && (
            <Link href="/" className="btn small">
              Ir al panel
            </Link>
          )}
          <button className="btn small" onClick={salir}>
            Salir
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      {!cargando && (rol === "admin" || rol === "socio") ? (
        <div className="empty">Esta pantalla es para los operadores. Tú trabajas desde el panel.</div>
      ) : (
        <>
          {rol === "operador" && uid && <MiPago uid={uid} conduces={conduces} />}

          <div className="tabs" style={{ marginBottom: 12 }}>
            <button className={vista === "horas" ? "tab on" : "tab"} onClick={() => setVista("horas")}>
              Horas
            </button>
            <button className={vista === "combustible" ? "tab on" : "tab"} onClick={() => setVista("combustible")}>
              Combustible
            </button>
            <button className={vista === "fallas" ? "tab on" : "tab"} onClick={() => setVista("fallas")}>
              Fallas
            </button>
          </div>

          <button
            className="btn primary"
            style={{ width: "100%", minHeight: 56, fontSize: 18, marginBottom: 16 }}
            onClick={() => (vista === "horas" ? setAbierto(null) : vista === "combustible" ? setGasoil(null) : setFalla(null))}
            disabled={maquinas.length === 0}
          >
            {vista === "horas" ? "+ Reportar el día" : vista === "combustible" ? "+ Cargar combustible" : "+ Reportar una falla"}
          </button>
          {!cargando && maquinas.length === 0 && (
            <div className="aviso" style={{ marginBottom: 12 }}>
              Todavía no tienes una máquina asignada. Habla con el administrador.
            </div>
          )}

          {cargando && <div className="empty">Cargando...</div>}
          {vista === "horas" && !cargando && !error && conduces.length === 0 && maquinas.length > 0 && (
            <div className="empty">Aún no has reportado ningún día.</div>
          )}
          {vista === "combustible" && !cargando && !error && cargas.length === 0 && maquinas.length > 0 && (
            <div className="empty">Aún no has cargado combustible.</div>
          )}

          {vista === "fallas" && !cargando && !error && fallas.length === 0 && maquinas.length > 0 && (
            <div className="empty">No has reportado ninguna falla.</div>
          )}

          {vista === "fallas" &&
            fallas.map((x) => (
              <button key={x.id} className="card" onClick={() => setFalla(x)}>
                <div className="row">
                  <div>
                    <h2>{x.descripcion.length > 60 ? `${x.descripcion.slice(0, 60)}…` : x.descripcion}</h2>
                    <span className={x.estado === "Resuelto" ? "pill disp" : x.estado === "Nuevo" ? "pill obra" : "pill taller"}>
                      {x.estado === "Nuevo" ? "Enviado al administrador" : x.estado}
                    </span>
                    {x.urgencia === "Debe parar" && (
                      <span className="pill taller" style={{ marginLeft: 6 }}>
                        Debe parar
                      </span>
                    )}
                  </div>
                </div>
                <div className="line">
                  {fmtFecha(x.fecha)} · {x.fotos.length} {x.fotos.length === 1 ? "foto" : "fotos"}
                  {x.video_path ? " · video" : ""}
                </div>
              </button>
            ))}

          {vista === "combustible" &&
            cargas.map((x) => (
              <button key={x.id} className="card" onClick={() => setGasoil(x)}>
                <div className="row">
                  <div>
                    <h2>Combustible</h2>
                    <span
                      className={x.estado === "Aprobado" ? "pill disp" : x.estado === "Rechazado" ? "pill taller" : "pill obra"}
                    >
                      {x.estado === "Pendiente" ? "Esperando aprobación" : x.estado}
                    </span>
                  </div>
                  <div className="horas">
                    {fmtNum(x.galones, 2)}
                    <small> gal</small>
                  </div>
                </div>
                <div className="line">{[fmtFecha(x.fecha), x.nota].filter(Boolean).join(" · ")}</div>
                {x.estado === "Rechazado" && (
                  <div className="alerta">Rechazada{x.motivo_rechazo ? `: ${x.motivo_rechazo}` : ""}. Toca para corregir.</div>
                )}
              </button>
            ))}

          {vista === "horas" && conduces.map((c) => {
            const falta = c.estado !== "Rechazado" && !c.firmado && !c.foto_firmada_path;
            return (
              <button key={c.id} className="card" onClick={() => setAbierto(c)}>
                <div className="row">
                  <div>
                    <h2>
                      {c.libreta} #{c.numero}{c.implemento ? ` · ${c.implemento}` : ""}
                    </h2>
                    <span
                      className={c.estado === "Aprobado" ? "pill disp" : c.estado === "Rechazado" ? "pill taller" : "pill obra"}
                    >
                      {c.estado === "Pendiente" ? "Esperando aprobación" : c.estado}
                    </span>
                    {c.firmado && (
                      <span className="pill disp" style={{ marginLeft: 6 }}>
                        Firmado
                      </span>
                    )}
                  </div>
                </div>
                <div className="line">{fmtFecha(c.fecha)}</div>
                {c.estado === "Rechazado" && (
                  <div className="alerta">Rechazado{c.motivo_rechazo ? `: ${c.motivo_rechazo}` : ""}. Toca para corregir.</div>
                )}
                {falta && <div className="aviso">Falta el conduce firmado. Toca para subirlo.</div>}
                {!c.firmado && c.foto_firmada_path && c.estado !== "Rechazado" && (
                  <div className="line">Firmado subido, el administrador lo va a revisar.</div>
                )}
              </button>
            );
          })}
        </>
      )}

      {gasoil !== undefined && (
        <FuelOperadorForm
          carga={gasoil}
          uid={uid}
          maquinas={maquinas}
          onClose={() => setGasoil(undefined)}
          onSaved={() => {
            setGasoil(undefined);
            cargar();
          }}
        />
      )}

      {falla !== undefined && (
        <FallaOperadorForm
          reporte={falla}
          uid={uid}
          maquinas={maquinas}
          onClose={() => setFalla(undefined)}
          onSaved={() => {
            setFalla(undefined);
            cargar();
          }}
        />
      )}

      {abierto !== undefined && (
        <OperadorForm
          conduce={abierto}
          uid={uid}
          maquinas={maquinas}
          onClose={() => setAbierto(undefined)}
          onSaved={() => {
            setAbierto(undefined);
            cargar();
          }}
        />
      )}
    </main>
  );
}
