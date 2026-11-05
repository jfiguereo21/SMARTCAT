import type { Moneda } from "./machines";

// Una carga de combustible, que se anota como gasto de la máquina.
export type FuelLog = {
  id: string;
  fecha: string; // AAAA-MM-DD
  machine_id: string;
  galones: number;
  precio_galon: number;
  moneda: Moneda;
  monto: number; // galones × precio, lo calcula la base de datos
  nota: string | null;
  machines?: { nombre: string } | null;
};

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

// Lo que cuesta la carga: galones por precio del galón, a 2 decimales.
export function montoCarga(galones: number, precioGalon: number): number {
  return redondear2(galones * precioGalon);
}

export type TotalesGasto = { galones: number; DOP: number; USD: number };

// Suma las cargas: los galones juntos y el dinero separado por moneda (no se mezclan pesos con dólares).
export function sumarCargas(cargas: Pick<FuelLog, "galones" | "monto" | "moneda">[]): TotalesGasto {
  const t: TotalesGasto = { galones: 0, DOP: 0, USD: 0 };
  for (const c of cargas) {
    t.galones += c.galones;
    t[c.moneda] += c.monto;
  }
  return { galones: redondear2(t.galones), DOP: redondear2(t.DOP), USD: redondear2(t.USD) };
}
