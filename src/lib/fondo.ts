// Fondo de la sociedad: reglas de saldo y cuenta con socios. Todo en pesos (RD$).
//
// Saldo del fondo = saldo inicial
//   + entradas del fondo ya pagadas (desde la fecha de inicio)
//   − salidas del fondo ya pagadas (desde la fecha de inicio)
//   − pagos a operadores (automático, desde la fecha de inicio)
// Lo que un socio paga de su bolsillo NO toca el saldo del fondo: se anota en la cuenta con socios.

export type TipoMov = "Entrada" | "Salida";
export type OrigenMov = "Fondo" | "Bolsillo";

export type FondoMov = {
  id: string;
  fecha: string;
  tipo: TipoMov;
  categoria: string;
  monto: number;
  machine_id: string | null;
  descripcion: string | null;
  origen: OrigenMov;
  socio_id: string | null;
  comprobante_path: string | null;
  creado_por: string;
  created_at: string;
  aprobado_por: string | null;
  aprobado_en: string | null;
  rechazado_por: string | null;
  rechazado_en: string | null;
  motivo_rechazo: string | null;
  pagado_por: string | null;
  pagado_en: string | null;
  machines?: { nombre: string } | null;
};

export type FondoConfig = { saldo_inicial: number; fecha_inicial: string | null };

export const CAT_APORTE = "Aporte de socio";
export const CAT_REEMBOLSO = "Reembolso a socio";
export const CAT_REPARTO = "Reparto a socios";

export const CATEGORIAS_ENTRADA = [CAT_APORTE, "Cobro de cliente", "Otro ingreso"];
export const CATEGORIAS_SALIDA = [
  "Combustible",
  "Mantenimiento y repuestos",
  "Transporte",
  "Seguro",
  "GPS",
  "Impuestos y TSS",
  CAT_REEMBOLSO,
  CAT_REPARTO,
  "Otro gasto",
];
export const CATEGORIAS_CON_SOCIO = [CAT_APORTE, CAT_REEMBOLSO, CAT_REPARTO];

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type EstadoMov = "Por aprobar" | "Por pagar" | "Pagado" | "Rechazado";

export function estadoMov(m: FondoMov): EstadoMov {
  if (m.rechazado_en) return "Rechazado";
  if (m.pagado_en) return "Pagado";
  if (m.aprobado_en) return "Por pagar";
  return "Por aprobar";
}

// ¿Este movimiento espera algo de mí? (lo registró el otro socio y falta aprobarlo,
// o ya está aprobado y falta pagarlo)
export function necesitaMiAccion(m: FondoMov, uid: string): boolean {
  if (m.rechazado_en) return false;
  if (!m.aprobado_en && m.creado_por !== uid) return true;
  if (m.aprobado_en && !m.pagado_en && m.origen === "Fondo") return true;
  return false;
}

export type PagoOp = { fecha_pago: string; neto: number };

export type SaldoFondo = {
  inicial: number;
  entradas: number;
  salidas: number;
  operadores: number;
  saldo: number;
  porPagar: number; // salidas aprobadas que todavía no se pagan
};

export function saldoFondo(config: FondoConfig, movs: FondoMov[], pagosOp: PagoOp[]): SaldoFondo {
  const desde = config.fecha_inicial;
  const cuenta = (fecha: string) => desde != null && fecha >= desde;
  let entradas = 0;
  let salidas = 0;
  let porPagar = 0;
  for (const m of movs) {
    if (m.origen !== "Fondo" || m.rechazado_en) continue;
    if (m.pagado_en) {
      if (!cuenta(m.fecha)) continue;
      if (m.tipo === "Entrada") entradas += m.monto;
      else salidas += m.monto;
    } else if (m.tipo === "Salida" && m.aprobado_en) {
      porPagar += m.monto;
    }
  }
  let operadores = 0;
  for (const p of pagosOp) if (cuenta(p.fecha_pago)) operadores += p.neto;
  entradas = redondear2(entradas);
  salidas = redondear2(salidas);
  operadores = redondear2(operadores);
  const inicial = redondear2(config.saldo_inicial);
  return {
    inicial,
    entradas,
    salidas,
    operadores,
    porPagar: redondear2(porPagar),
    saldo: redondear2(inicial + entradas - salidas - operadores),
  };
}

export type CuentaSocio = {
  socio_id: string;
  aportes: number; // puso dinero en el fondo
  adelantos: number; // pagó gastos de la sociedad de su bolsillo
  reembolsos: number; // el fondo le devolvió
  repartos: number; // se llevó como ganancia
  saldo: number; // lo que la sociedad le debe (si es negativo, él le debe a la sociedad)
  sinAprobar: number; // cuántos movimientos suyos aún no aprobó el otro socio
};

export function cuentaSocios(movs: FondoMov[], socioIds: string[]): CuentaSocio[] {
  const mapa = new Map<string, CuentaSocio>();
  for (const id of socioIds)
    mapa.set(id, { socio_id: id, aportes: 0, adelantos: 0, reembolsos: 0, repartos: 0, saldo: 0, sinAprobar: 0 });
  for (const m of movs) {
    if (!m.socio_id || m.rechazado_en) continue;
    const c = mapa.get(m.socio_id);
    if (!c) continue;
    if (!m.aprobado_en) c.sinAprobar += 1;
    if (!m.pagado_en) continue;
    if (m.origen === "Bolsillo" && m.tipo === "Salida") c.adelantos += m.monto;
    else if (m.origen === "Fondo" && m.tipo === "Entrada" && m.categoria === CAT_APORTE) c.aportes += m.monto;
    else if (m.origen === "Fondo" && m.tipo === "Salida" && m.categoria === CAT_REEMBOLSO) c.reembolsos += m.monto;
    else if (m.origen === "Fondo" && m.tipo === "Salida" && m.categoria === CAT_REPARTO) c.repartos += m.monto;
  }
  return [...mapa.values()].map((c) => ({
    ...c,
    aportes: redondear2(c.aportes),
    adelantos: redondear2(c.adelantos),
    reembolsos: redondear2(c.reembolsos),
    repartos: redondear2(c.repartos),
    saldo: redondear2(c.aportes + c.adelantos - c.reembolsos),
  }));
}

// Cuadre: lo que dice el banco contra lo que dice SmartCat.
export function diferenciaCuadre(saldoBanco: number, saldoApp: number): number {
  return redondear2(saldoBanco - saldoApp);
}
