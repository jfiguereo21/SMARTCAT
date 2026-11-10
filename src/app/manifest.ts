import type { MetadataRoute } from "next";

// Permite instalar la app en el celular: "Agregar a la pantalla de inicio".
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SmartCat FIPEC",
    short_name: "SmartCat",
    description: "Control de maquinaria, conduces y horas de FIPEC",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f5f7",
    theme_color: "#0b5cad",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
