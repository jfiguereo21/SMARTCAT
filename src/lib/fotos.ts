"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reducirImagen } from "@/lib/imagen";

// Sube una foto a la carpeta del usuario (su id) y devuelve la ruta guardada.
export async function subirFoto(file: File, uid: string, etiqueta: string): Promise<string> {
  const blob = await reducirImagen(file);
  const ruta = `${uid}/${etiqueta}-${Date.now()}.jpg`;
  const { error } = await createClient()
    .storage.from("conduces")
    .upload(ruta, blob, { contentType: blob.type || "image/jpeg" });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return ruta;
}

// Enlace temporal para ver una foto guardada.
export function useFotoUrl(path: string | null | undefined) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!path) {
      setUrl("");
      return;
    }
    createClient()
      .storage.from("conduces")
      .createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl ?? ""));
  }, [path]);
  return url;
}
