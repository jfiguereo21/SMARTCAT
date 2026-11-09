"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reducirImagen } from "@/lib/imagen";

export type EstadoFalla = "Nuevo" | "Enviado" | "En reparación" | "Resuelto";
export type Urgencia = "Puede seguir" | "Debe parar";

export const ESTADOS_FALLA: EstadoFalla[] = ["Nuevo", "Enviado", "En reparación", "Resuelto"];
export const MAX_FOTOS = 6;
export const MAX_VIDEO_MB = 50;

export type ReporteFalla = {
  id: string;
  machine_id: string;
  creado_por: string;
  fecha: string;
  descripcion: string;
  urgencia: Urgencia;
  estado: EstadoFalla;
  fotos: string[];
  video_path: string | null;
  asignado_a: string | null;
  nota_admin: string | null;
  resuelto_en: string | null;
  created_at: string;
  machines?: { nombre: string } | null;
  creador?: { nombre: string | null } | null;
};

const BUCKET = "fallas";

export async function subirFotoFalla(file: File, uid: string): Promise<string> {
  const blob = await reducirImagen(file);
  const ruta = `${uid}/falla-foto-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await createClient()
    .storage.from(BUCKET)
    .upload(ruta, blob, { contentType: blob.type || "image/jpeg" });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return ruta;
}

export async function subirVideoFalla(file: File, uid: string): Promise<string> {
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new Error(`El video pesa más de ${MAX_VIDEO_MB} MB. Grábalo más corto (unos 20 a 30 segundos).`);
  }
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
  const ruta = `${uid}/falla-video-${Date.now()}.${ext}`;
  const { error } = await createClient()
    .storage.from(BUCKET)
    .upload(ruta, file, { contentType: file.type || "video/mp4" });
  if (error) throw new Error(`No se pudo subir el video: ${error.message}`);
  return ruta;
}

export async function borrarArchivosFalla(rutas: string[]) {
  if (rutas.length === 0) return;
  await createClient().storage.from(BUCKET).remove(rutas);
}

// Enlace temporal para ver una foto o un video guardado.
export function useFallaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!path) {
      setUrl("");
      return;
    }
    createClient()
      .storage.from(BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? ""));
  }, [path]);
  return url;
}
