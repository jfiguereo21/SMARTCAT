export type Libreta = "FIPEC" | "BRAU";
export type EstadoConduce = "Pendiente" | "Aprobado" | "Rechazado";

export type Implemento = "Cubo" | "Martillo" | "Otro";
export const IMPLEMENTOS: Implemento[] = ["Cubo", "Martillo", "Otro"];

export type Tramo = { entrada: string; salida: string };

export type Conduce = {
  id: string;
  libreta: Libreta;
  numero: number;
  fecha: string; // AAAA-MM-DD
  machine_id: string;
  client_id: string | null;
  obra: string | null;
  zona: string | null;
  trabajo: string | null;
  implemento: Implemento | null;
  tramos: Tramo[];
  horas_calculadas: number;
  horas_escritas: number | null;
  firmado: boolean;
  horas_cobrables: number;
  foto_path: string | null;
  foto_firmada_path: string | null;
  notas: string | null;
  estado: EstadoConduce;
  creado_por: string | null;
  motivo_rechazo: string | null;
  aprobado_por: string | null;
  aprobado_en: string | null;
  creador?: { nombre: string | null } | null;
  machines?: { nombre: string } | null;
  clients?: { nombre: string } | null;
};

export type Cliente = { id: string; nombre: string; rnc: string | null };

const redondear2 = (n: number) => Math.round(n * 100) / 100;

function minutos(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Minutos de un tramo, o null si falta una hora o la salida no es después de la entrada.
export function minutosTramo(t: Tramo): number | null {
  const a = minutos(t.entrada);
  const b = minutos(t.salida);
  if (a == null || b == null || b <= a) return null;
  return b - a;
}

// Horas en decimales de un solo tramo, por ejemplo 8:47 a 12:00 = 3.22
export function horasTramo(t: Tramo): number | null {
  const m = minutosTramo(t);
  return m == null ? null : redondear2(m / 60);
}

// Suma los minutos de todos los tramos y convierte al final, para no acumular redondeos.
export function sumaTramos(tramos: Tramo[]): number {
  const total = tramos.reduce((acc, t) => acc + (minutosTramo(t) ?? 0), 0);
  return redondear2(total / 60);
}

// Lo que escribe el operador: acepta "8", "7.5", "7,5" o "7:30" (siete horas y media).
export function aHoras(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(limpio);
  if (hm) {
    const min = Number(hm[2]);
    if (min > 59) return null;
    return redondear2(Number(hm[1]) + min / 60);
  }
  const n = Number(limpio.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Misma regla que la base de datos: firmado con total escrito = se cobra el total escrito;
// si no, se cobran las horas de los tramos; si no hay tramos, lo que escribió el operador.
export function horasCobrables(
  firmado: boolean,
  calculadas: number,
  escritas: number | null
): number {
  if (firmado && escritas != null) return escritas;
  if (calculadas > 0) return calculadas;
  return escritas ?? 0;
}

const TOLERANCIA = 0.25; // el operador redondea; hasta 15 minutos de diferencia es normal

export function noCuadra(calculadas: number, escritas: number | null): boolean {
  return (
    escritas != null && calculadas > 0 && Math.abs(escritas - calculadas) > TOLERANCIA
  );
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partes(fecha: string): { y: number; m: number; d: number } {
  const [y, m, d] = fecha.split("-").map(Number);
  return { y, m, d };
}

export function fmtFecha(fecha: string): string {
  const { y, m, d } = partes(fecha);
  return `${d} ${MESES[m - 1]} ${y}`;
}

// El corte es el día 25: del 26 de un mes al 25 del siguiente.
export function corteDe(fecha: string): { clave: string; etiqueta: string } {
  const { y, m, d } = partes(fecha);
  const inicio = d >= 26 ? new Date(Date.UTC(y, m - 1, 26)) : new Date(Date.UTC(y, m - 2, 26));
  const fin = d >= 26 ? new Date(Date.UTC(y, m, 25)) : new Date(Date.UTC(y, m - 1, 25));
  const clave = fin.toISOString().slice(0, 10);
  const etiqueta = `26 ${MESES[inicio.getUTCMonth()]} – 25 ${MESES[fin.getUTCMonth()]} ${fin.getUTCFullYear()}`;
  return { clave, etiqueta };
}

export type ResumenHoras = { hoy: number; aprobadas: number; pendientes: number; rechazadas: number };

// Horas de un operador: las de hoy y las del corte actual, separando lo aprobado de lo que espera aprobación.
export function resumenHoras(
  conduces: Pick<Conduce, "fecha" | "estado" | "horas_cobrables">[],
  hoy: string
): ResumenHoras {
  const corte = corteDe(hoy).clave;
  const r: ResumenHoras = { hoy: 0, aprobadas: 0, pendientes: 0, rechazadas: 0 };
  for (const c of conduces) {
    const h = Number(c.horas_cobrables);
    if (c.fecha === hoy && c.estado !== "Rechazado") r.hoy += h;
    if (corteDe(c.fecha).clave !== corte) continue;
    if (c.estado === "Aprobado") r.aprobadas += h;
    else if (c.estado === "Pendiente") r.pendientes += h;
    else r.rechazadas += h;
  }
  const d = (n: number) => Math.round(n * 100) / 100;
  return { hoy: d(r.hoy), aprobadas: d(r.aprobadas), pendientes: d(r.pendientes), rechazadas: d(r.rechazadas) };
}
