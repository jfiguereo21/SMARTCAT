// Reduce la foto antes de subirla (las fotos del teléfono pesan 3 a 6 MB).
// Si el navegador no puede procesarla, se sube la original.
export async function reducirImagen(
  file: File,
  maxLado = 1600,
  calidad = 0.8
): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", calidad)
    );
  } catch {
    return file;
  }
}
