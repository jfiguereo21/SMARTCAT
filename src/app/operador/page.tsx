"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import OperadorForm, { type MaquinaOperador } from "@/components/OperadorForm";
import { fmtNum, hoyRD } from "@/lib/machines";
import { corteDe, fmtFecha, resumenHoras, type Conduce } from "@/lib/conduces";

export default function OperadorPage() {
  const [uid, setUid] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("");
  const [maquinas, setMaquinas] = useState<MaquinaOperador[]>([]);
  const [conduces, setConduces] = useState<Conduce[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  // undefined = cerrado, null = reporte nuevo, Conduce = abierto
  const [abierto, setAbierto] = useState<Conduce | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setUid(u.user.id);
    const [p, m, c] = await Promise.all([
      supabase.from("perfiles").select("nombre, rol").eq("user_id", u.user.id).maybeSingle(),
      supabase.from("operador_maquinas").select("machine_id, maquina_nombre").eq("user_id", u.user.id),
      supabase
        .from("conduces")
        .select("*")
        .eq("creado_por", u.user.id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    const fallo = p.error ?? m.error ?? c.error;
    if (fallo) setError(`No se pudieron cargar los datos: ${fallo.message}`);
    else {
      setError("");
      setNombre(p.data?.nombre ?? "");
      setRol(p.data?.rol ?? "");
      setMaquinas((m.data ?? []) as MaquinaOperador[]);
      setConduces(((c.data ?? []) as Conduce[]).map((x) => ({ ...x, horas_cobrables: Number(x.horas_cobrables) })));
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

  const hoy = hoyRD();
  const r = useMemo(() => resumenHoras(conduces, hoy), [conduces, hoy]);
  const etiquetaCorte = corteDe(hoy).etiqueta;
  const nombreMaq = (id: string) => maquinas.find((m) => m.machine_id === id)?.maquina_nombre ?? "Máquina";

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
          {rol === "admin" && (
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

      {!cargando && rol === "admin" ? (
        <div className="empty">Esta pantalla es para los operadores. Tú trabajas desde el panel.</div>
      ) : (
        <>
          <div className="totales">
            <div className="total">
              <div className="total-n">Hoy</div>
              <div className="total-h">{fmtNum(r.hoy, 2)} h</div>
            </div>
            <div className="total">
              <div className="total-n">Aprobadas · este corte</div>
              <div className="total-h">{fmtNum(r.aprobadas, 2)} h</div>
              <div className="total-c">{etiquetaCorte}</div>
            </div>
            <div className="total">
              <div className="total-n">Esperando aprobación</div>
              <div className="total-h">{fmtNum(r.pendientes, 2)} h</div>
            </div>
          </div>

          <button
            className="btn primary"
            style={{ width: "100%", minHeight: 56, fontSize: 18, marginBottom: 16 }}
            onClick={() => setAbierto(null)}
            disabled={maquinas.length === 0}
          >
            + Reportar el día
          </button>
          {!cargando && maquinas.length === 0 && (
            <div className="aviso" style={{ marginBottom: 12 }}>
              Todavía no tienes una máquina asignada. Habla con el administrador.
            </div>
          )}

          {cargando && <div className="empty">Cargando...</div>}
          {!cargando && !error && conduces.length === 0 && maquinas.length > 0 && (
            <div className="empty">Aún no has reportado ningún día.</div>
          )}

          {conduces.map((c) => {
            const falta = c.estado !== "Rechazado" && !c.firmado && !c.foto_firmada_path;
            return (
              <button key={c.id} className="card" onClick={() => setAbierto(c)}>
                <div className="row">
                  <div>
                    <h2>
                      {c.libreta} #{c.numero} · {nombreMaq(c.machine_id)}
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
                  <div className="horas">
                    {fmtNum(Number(c.horas_cobrables), 2)}
                    <small> h</small>
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
