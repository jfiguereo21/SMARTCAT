"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fmtFecha } from "@/lib/conduces";
import {
  MAX_FOTOS,
  MAX_VIDEO_MB,
  borrarArchivosFalla,
  subirFotoFalla,
  subirVideoFalla,
  type ReporteFalla,
  type Urgencia,
} from "@/lib/fallas";
import { FotoFalla, VideoFalla } from "@/components/FallaMedia";
import type { MaquinaOperador } from "@/components/OperadorForm";

type Props = {
  reporte: ReporteFalla | null; // null = reporte nuevo
  uid: string;
  maquinas: MaquinaOperador[];
  onClose: () => void;
  onSaved: () => void;
};

// Pantalla del operador para reportar una falla de su máquina con fotos y video.
// Mientras el administrador no la tome (estado Nuevo) la puede corregir; después solo se mira.
export default function FallaOperadorForm({ reporte, uid, maquinas, onClose, onSaved }: Props) {
  const nuevo = reporte === null;
  const editable = nuevo || reporte.estado === "Nuevo";

  const [machineId, setMachineId] = useState(reporte?.machine_id ?? (maquinas.length === 1 ? maquinas[0].machine_id : ""));
  const [descripcion, setDescripcion] = useState(reporte?.descripcion ?? "");
  const [urgencia, setUrgencia] = useState<Urgencia>(reporte?.urgencia ?? "Puede seguir");
  const [fotosGuardadas, setFotosGuardadas] = useState<string[]>(reporte?.fotos ?? []);
  const [fotosNuevas, setFotosNuevas] = useState<File[]>([]);
  const [videoGuardado, setVideoGuardado] = useState<string | null>(reporte?.video_path ?? null);
  const [videoNuevo, setVideoNuevo] = useState<File | null>(null);

  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [borrarListo, setBorrarListo] = useState(false);

  const totalFotos = fotosGuardadas.length + fotosNuevas.length;

  function agregarFotos(lista: FileList | null) {
    if (!lista) return;
    const nuevas = Array.from(lista);
    if (totalFotos + nuevas.length > MAX_FOTOS) {
      setError(`Máximo ${MAX_FOTOS} fotos por reporte.`);
      return;
    }
    setError("");
    setFotosNuevas((p) => [...p, ...nuevas]);
  }

  function elegirVideo(f: File | null) {
    if (f && f.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`El video pesa más de ${MAX_VIDEO_MB} MB. Grábalo más corto (unos 20 a 30 segundos).`);
      return;
    }
    setError("");
    setVideoNuevo(f);
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!machineId) return setError("Escoge la máquina.");
    if (descripcion.trim() === "") return setError("Cuéntanos qué le pasa a la máquina.");

    setGuardando(true);
    const subidos: string[] = [];
    try {
      const rutasFotos = [...fotosGuardadas];
      for (const f of fotosNuevas) {
        const r = await subirFotoFalla(f, uid);
        subidos.push(r);
        rutasFotos.push(r);
      }
      let rutaVideo = videoGuardado;
      if (videoNuevo) {
        rutaVideo = await subirVideoFalla(videoNuevo, uid);
        subidos.push(rutaVideo);
      }

      const datos = {
        machine_id: machineId,
        descripcion: descripcion.trim(),
        urgencia,
        fotos: rutasFotos,
        video_path: rutaVideo,
      };
      const supabase = createClient();
      const { error: err } = nuevo
        ? await supabase.from("reportes_falla").insert({ ...datos, creado_por: uid })
        : await supabase.from("reportes_falla").update(datos).eq("id", reporte.id);
      if (err) throw new Error(`No se pudo guardar: ${err.message}`);

      // Ya guardado: se borran los archivos que el operador quitó o cambió.
      if (reporte) {
        const sobran = reporte.fotos.filter((r) => !rutasFotos.includes(r));
        if (reporte.video_path && reporte.video_path !== rutaVideo) sobran.push(reporte.video_path);
        await borrarArchivosFalla(sobran);
      }
      setGuardando(false);
      onSaved();
    } catch (ex) {
      await borrarArchivosFalla(subidos);
      setGuardando(false);
      setError(ex instanceof Error ? ex.message : "No se pudo guardar.");
    }
  }

  async function borrar() {
    if (!reporte) return;
    if (!borrarListo) {
      setBorrarListo(true);
      setTimeout(() => setBorrarListo(false), 5000);
      return;
    }
    setGuardando(true);
    const { error: err } = await createClient().from("reportes_falla").delete().eq("id", reporte.id);
    if (err) {
      setGuardando(false);
      return setError(`No se pudo borrar: ${err.message}`);
    }
    await borrarArchivosFalla([...reporte.fotos, ...(reporte.video_path ? [reporte.video_path] : [])]);
    setGuardando(false);
    onSaved();
  }

  return (
    <div className="sheet-bg" onClick={onClose}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <h2>{nuevo ? "Reportar una falla" : "Reporte de falla"}</h2>
        {error && <div className="error">{error}</div>}

        {!editable && reporte ? (
          <>
            <div className="resumen">
              <div>{fmtFecha(reporte.fecha)}</div>
              <div>
                Estado: <b>{reporte.estado}</b>
              </div>
              <div>{reporte.descripcion}</div>
              <div>{reporte.urgencia === "Debe parar" ? "La máquina tenía que parar." : "La máquina podía seguir trabajando."}</div>
            </div>
            <div className="hint" style={{ marginBottom: 8 }}>
              El administrador ya tomó este reporte. Si hay algo más, avísale directamente.
            </div>
            {reporte.fotos.map((r) => (
              <FotoFalla key={r} path={r} />
            ))}
            {reporte.video_path && <VideoFalla path={reporte.video_path} />}
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="f-maq">Máquina</label>
              <select id="f-maq" value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                <option value="">Escoge la máquina</option>
                {maquinas.map((m) => (
                  <option key={m.machine_id} value={m.machine_id}>
                    {m.maquina_nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="f-desc">¿Qué le pasa?</label>
              <textarea id="f-desc" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
              <div className="hint">Por ejemplo: bota aceite por la manguera del brazo, hace un ruido al girar.</div>
            </div>

            <div className="field">
              <label>¿Puede seguir trabajando?</label>
              <div className="actions">
                <button
                  type="button"
                  className={urgencia === "Puede seguir" ? "btn primary grow" : "btn grow"}
                  onClick={() => setUrgencia("Puede seguir")}
                >
                  Puede seguir
                </button>
                <button
                  type="button"
                  className={urgencia === "Debe parar" ? "btn danger armed grow" : "btn grow"}
                  onClick={() => setUrgencia("Debe parar")}
                >
                  Debe parar
                </button>
              </div>
            </div>

            <div className="field">
              <label htmlFor="f-fotos">
                Fotos ({totalFotos} de {MAX_FOTOS})
              </label>
              {fotosGuardadas.map((r) => (
                <FotoFalla key={r} path={r} onQuitar={() => setFotosGuardadas((p) => p.filter((x) => x !== r))} />
              ))}
              {fotosNuevas.map((f, i) => (
                <div className="row" key={`${f.name}-${i}`} style={{ marginBottom: 6 }}>
                  <span className="hint" style={{ margin: 0 }}>
                    {f.name}
                  </span>
                  <button type="button" className="btn small danger" onClick={() => setFotosNuevas((p) => p.filter((_, j) => j !== i))}>
                    Quitar
                  </button>
                </div>
              ))}
              {totalFotos < MAX_FOTOS && (
                <input
                  id="f-fotos"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    agregarFotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              )}
            </div>

            <div className="field">
              <label htmlFor="f-video">Video (opcional)</label>
              {videoGuardado && !videoNuevo && (
                <>
                  <VideoFalla path={videoGuardado} />
                  <button type="button" className="btn small danger" onClick={() => setVideoGuardado(null)}>
                    Quitar el video
                  </button>
                </>
              )}
              {videoNuevo && (
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className="hint" style={{ margin: 0 }}>
                    {videoNuevo.name} · {(videoNuevo.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button type="button" className="btn small danger" onClick={() => setVideoNuevo(null)}>
                    Quitar
                  </button>
                </div>
              )}
              {!videoNuevo && (
                <input id="f-video" type="file" accept="video/*" onChange={(e) => elegirVideo(e.target.files?.[0] ?? null)} />
              )}
              <div className="hint">Máximo {MAX_VIDEO_MB} MB: un video corto de 20 a 30 segundos. Si sube lento, espera a tener buena señal.</div>
            </div>
          </>
        )}

        <div className="actions">
          {editable && (
            <button type="submit" className="btn primary grow" disabled={guardando}>
              {guardando ? "Enviando..." : nuevo ? "Enviar reporte" : "Guardar cambios"}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose} disabled={guardando}>
            {editable ? "Cancelar" : "Cerrar"}
          </button>
          {!nuevo && editable && (
            <button type="button" className={`btn danger${borrarListo ? " armed" : ""}`} onClick={borrar} disabled={guardando}>
              {borrarListo ? "Toca otra vez para borrar" : "Borrar"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
