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
  consumo_esperado: number | null; // galones por hora que se consideran normales
  estado: Estado;
  obra: string | null;
  seguro: string | null;
  vencimiento_poliza: string | null;
  propiedad: Propiedad;
  dueno: string | null;
  pago_dueno: number | null;
  notas: string | null;
};

// Lo que se pacta cada vez que la máquina se alquila en un sitio.
export type Acuerdo = {
  id: string;
  machine_id: string;
  client_id: string | null;
  obra: string | null;
  moneda: Moneda;
  tarifa: number;
  fecha_inicio: string; // AAAA-MM-DD
  fecha_fin: string | null; // null = sigue vigente
  notas: string | null;
  machines?: { nombre: string } | null;
  clients?: { nombre: string } | null;
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

export function fmtMonto(n: number, moneda: Moneda): string {
  return moneda === "USD" ? `US$${fmtNum(n, 2)}` : `RD$${fmtNum(n, 2)}`;
}

// El acuerdo que rige en una fecha: empezó antes o ese día y no ha terminado.
export function acuerdoVigente(acuerdos: Acuerdo[], machineId: string, fecha: string): Acuerdo | null {
  return (
    acuerdos.find(
      (a) =>
        a.machine_id === machineId &&
        a.fecha_inicio <= fecha &&
        (a.fecha_fin == null || a.fecha_fin >= fecha)
    ) ?? null
  );
}

export function fmtTarifa(a: Pick<Acuerdo, "tarifa" | "moneda"> | null): string {
  if (a == null) return "sin acuerdo de tarifa";
  return `${fmtMonto(a.tarifa, a.moneda)}/h`;
}

// Línea de margen para máquinas subcontratadas.
export function lineaMargen(m: Machine, a: Pick<Acuerdo, "tarifa" | "moneda"> | null): string | null {
  if (m.propiedad !== "Subcontratada") return null;
  const pago =
    m.pago_dueno != null ? `pago al dueño RD$${fmtNum(m.pago_dueno, 0)}/h` : "pago al dueño sin definir";
  if (a == null || m.pago_dueno == null) return pago;
  if (a.moneda === "USD") return `${pago} · el margen depende de la tasa del dólar`;
  return `${pago} · margen base RD$${fmtNum(a.tarifa - m.pago_dueno, 0)}/h`;
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
