export type Estado = "Disponible" | "En obra" | "En taller";
export type Moneda = "USD" | "DOP";
export type Propiedad = "Propia" | "Subcontratada";

export type Machine = {
  id: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  serie: string | null;
  anio: number | null;
  horometro: number | null;
  horometro_fecha: string | null;
  tarifa: number | null;
  moneda: Moneda;
  estado: Estado;
  obra: string | null;
  seguro: string | null;
  vencimiento_poliza: string | null;
  propiedad: Propiedad;
  dueno: string | null;
  pago_dueno: number | null;
  notas: string | null;
};

export const ESTADOS: Estado[] = ["Disponible", "En obra", "En taller"];

// Fecha de hoy en República Dominicana, formato AAAA-MM-DD.
export function hoyRD(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Santo_Domingo",
  });
}

export function fmtNum(n: number, decimales: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

export function fmtTarifa(m: Pick<Machine, "tarifa" | "moneda">): string {
  if (m.tarifa == null) return "tarifa sin definir";
  return m.moneda === "USD"
    ? `base US$${fmtNum(m.tarifa, 2)}/h`
    : `base RD$${fmtNum(m.tarifa, 0)}/h`;
}

// Línea de margen para máquinas subcontratadas.
export function lineaMargen(m: Machine): string | null {
  if (m.propiedad !== "Subcontratada") return null;
  const pago =
    m.pago_dueno != null ? `pago al dueño RD$${fmtNum(m.pago_dueno, 0)}/h` : "pago al dueño sin definir";
  if (m.tarifa == null || m.pago_dueno == null) return pago;
  if (m.moneda === "USD") return `${pago} · el margen depende de la tasa del dólar`;
  return `${pago} · margen base RD$${fmtNum(m.tarifa - m.pago_dueno, 0)}/h`;
}

// Acepta "1,234.5", "1234,5" o "1234.5". Devuelve null si está vacío o no es número.
export function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\s/g, "");
  if (limpio === "") return null;
  const normal = limpio.includes(",") && !limpio.includes(".")
    ? limpio.replace(",", ".")
    : limpio.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}
