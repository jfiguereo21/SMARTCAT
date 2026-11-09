import type { Moneda } from "./machines";

export type Origen = "Cliente" | "Propio";
export type EstadoCarga = "Pendiente" | "Aprobado" | "Rechazado";

// Una carga de combustible. Si la dio el cliente, se le descuenta a la factura al precio del día 25;
// si la compraste tú, es un gasto tuyo con su precio.
// Las que reporta un operador nacen "Pendiente" y solo cuentan cuando el administrador las aprueba.
export type FuelLog = {
  id: string;
  fecha: string; // AAAA-MM-DD
  machine_id: string;
  origen: Origen;
  galones: number;
  precio_galon: number | null;
  moneda: Moneda;
  monto: number | null; // galones × precio; solo cuando hay precio
  nota: string | null;
  estado: EstadoCarga;
  creado_por: string | null;
  foto_path: string | null; // foto del comprobante
  motivo_rechazo: string | null;
  machines?: { nombre: string } | null;
  creador?: { nombre: string | null } | null;
};

export type PreciosCorte = {
  corte: string; // fecha del día 25 que cierra el corte
  precio_diesel_dop: number;
  tasa_dolar: number;
};

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

// Lo que cuesta la carga: galones por precio del galón, a 2 decimales.
export function montoCarga(galones: number, precioGalon: number): number {
  return redondear2(galones * precioGalon);
}

export type TotalesCombustible = {
  galones: number;
  galonesCliente: number;
  galonesPropios: number;
  DOP: number; // gasto propio en pesos
  USD: number; // gasto propio en dólares
};

// Suma las cargas. El dinero es solo el gasto propio y va separado por moneda.
export function sumarCargas(cargas: Pick<FuelLog, "galones" | "monto" | "moneda" | "origen">[]): TotalesCombustible {
  const t: TotalesCombustible = { galones: 0, galonesCliente: 0, galonesPropios: 0, DOP: 0, USD: 0 };
  for (const c of cargas) {
    t.galones += c.galones;
    if (c.origen === "Cliente") t.galonesCliente += c.galones;
    else {
      t.galonesPropios += c.galones;
      if (c.monto != null) t[c.moneda] += c.monto;
    }
  }
  return {
    galones: redondear2(t.galones),
    galonesCliente: redondear2(t.galonesCliente),
    galonesPropios: redondear2(t.galonesPropios),
    DOP: redondear2(t.DOP),
    USD: redondear2(t.USD),
  };
}

// Lo que el cliente descuenta por el combustible que él dio, en la moneda del acuerdo:
// galones × precio del galón del día 25 (en dólares: pesos entre la tasa del dólar).
export function descuentoCliente(
  galones: number,
  precioDieselDop: number,
  tasaDolar: number,
  monedaAcuerdo: Moneda
): number {
  const porGalon = monedaAcuerdo === "USD" ? precioDieselDop / tasaDolar : precioDieselDop;
  return redondear2(galones * porGalon);
}

// --- Control de consumo: galones por hora ---

export const UMBRAL_CONSUMO = 0.25; // más de 25% por encima o por debajo de lo normal = alerta
export const MIN_HORAS_CORTE = 8; // con menos horas el promedio no dice nada
export const MIN_HORAS_REFERENCIA = 10; // horas mínimas del historial para usarlo como referencia

export type Nivel =
  | "ok"
  | "alto"
  | "bajo"
  | "sin_horas" // hay combustible pero no hay conduces
  | "sin_combustible" // hay horas pero no hay cargas anotadas
  | "pocas_horas"
  | "sin_referencia"
  | "nada"; // ni horas ni combustible

export type Evaluacion = {
  gph: number | null;
  referencia: number | null;
  fuente: "normal" | "historial" | null;
  desviacion: number | null; // 0.38 = 38% por encima de lo normal
  nivel: Nivel;
};

export type CorteConsumo = { galones: number; horas: number };

// Compara los galones por hora del corte contra el consumo normal de la máquina;
// si no se ha puesto, contra el promedio de sus cortes anteriores.
export function evaluarConsumo(
  galones: number,
  horas: number,
  esperado: number | null,
  previos: CorteConsumo[]
): Evaluacion {
  const vacia: Evaluacion = { gph: null, referencia: null, fuente: null, desviacion: null, nivel: "nada" };
  if (galones <= 0 && horas <= 0) return vacia;
  if (horas <= 0) return { ...vacia, nivel: "sin_horas" };
  if (galones <= 0) return { ...vacia, nivel: "sin_combustible" };

  const gph = redondear2(galones / horas);

  let referencia: number | null = null;
  let fuente: Evaluacion["fuente"] = null;
  if (esperado != null && esperado > 0) {
    referencia = esperado;
    fuente = "normal";
  } else {
    const validos = previos.filter((p) => p.horas > 0 && p.galones > 0);
    const h = validos.reduce((a, p) => a + p.horas, 0);
    const g = validos.reduce((a, p) => a + p.galones, 0);
    if (h >= MIN_HORAS_REFERENCIA) {
      referencia = redondear2(g / h);
      fuente = "historial";
    }
  }

  if (horas < MIN_HORAS_CORTE) return { gph, referencia, fuente, desviacion: null, nivel: "pocas_horas" };
  if (referencia == null) return { gph, referencia, fuente, desviacion: null, nivel: "sin_referencia" };

  const desviacion = gph / referencia - 1;
  const nivel: Nivel = desviacion > UMBRAL_CONSUMO ? "alto" : desviacion < -UMBRAL_CONSUMO ? "bajo" : "ok";
  return { gph, referencia, fuente, desviacion, nivel };
}
