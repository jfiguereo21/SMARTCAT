// Fondo de la sociedad: reglas de saldo y cuenta con socios. Todo en pesos (RD$).
//
// Saldo del fondo = saldo inicial
//   + entradas del fondo ya pagadas (desde la fecha de inicio)
//   − salidas del fondo ya pagadas (desde la fecha de inicio)
//   − pagos a operadores (automático, desde la fecha de inicio, salvo los marcados "fuera del fondo")
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
  cierre_id: string | null;
  fondo_socio_id: string | null; // fondo del socio al que entra / del que sale (solo origen Fondo)
  machines?: { nombre: string } | null;
};

export type FondoConfig = { saldo_inicial: number; fecha_inicial: string | null; saldos_socios?: Record<string, number> };

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

export type PagoOp = { fecha_pago: string; neto: number; fuera_del_fondo?: boolean; fondo_socio_id?: string | null };

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
  for (const p of pagosOp) if (!p.fuera_del_fondo && cuenta(p.fecha_pago)) operadores += p.neto;
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

export function cuentaSocios(todos: FondoMov[], socioIds: string[]): CuentaSocio[] {
  const movs = todos.filter((m) => m.cierre_id == null); // lo archivado ya está cuadrado
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

// --- Cierre de cuenta de gastos de un socio ---
// Los gastos que un socio pagó de su bolsillo y las devoluciones que le hizo el fondo se cierran juntos
// cuando cuadran. Lo cerrado se archiva (sale de la pantalla de trabajo, queda en el Excel y en el Archivo).
// Debe coincidir con la regla de la función cerrar_cuenta_socio de la base de datos.

export const esGastoDeBolsillo = (m: FondoMov) => m.tipo === "Salida" && m.origen === "Bolsillo";
export const esDevolucion = (m: FondoMov) =>
  m.tipo === "Salida" && m.origen === "Fondo" && m.categoria === CAT_REEMBOLSO;

export type EstadoCierre = {
  gastos: FondoMov[];
  devoluciones: FondoMov[];
  totalGastos: number;
  totalDevuelto: number;
  falta: number; // lo que todavía hay que devolverle (negativo = se le devolvió de más)
  sinAprobar: number;
  puedeCerrar: boolean;
  motivo: string; // por qué todavía no se puede cerrar ("" si se puede)
};

export function estadoCierre(movs: FondoMov[], socioId: string): EstadoCierre {
  const abiertos = movs.filter(
    (m) =>
      m.socio_id === socioId &&
      m.cierre_id == null &&
      !m.rechazado_en &&
      !!m.pagado_en &&
      (esGastoDeBolsillo(m) || esDevolucion(m))
  );
  const gastos = abiertos.filter(esGastoDeBolsillo);
  const devoluciones = abiertos.filter(esDevolucion);
  const totalGastos = redondear2(gastos.reduce((t, m) => t + m.monto, 0));
  const totalDevuelto = redondear2(devoluciones.reduce((t, m) => t + m.monto, 0));
  const falta = redondear2(totalGastos - totalDevuelto);
  const sinAprobar = abiertos.filter((m) => !m.aprobado_en).length;
  let motivo = "";
  if (gastos.length === 0) motivo = "No tiene gastos pagados por cerrar.";
  else if (sinAprobar > 0) motivo = `Falta que el otro socio apruebe ${sinAprobar} movimiento(s).`;
  else if (falta > 0) motivo = `Todavía falta devolverle ${falta.toFixed(2)}.`;
  else if (falta < 0) motivo = `Se le devolvió ${(-falta).toFixed(2)} de más: no cuadra.`;
  return {
    gastos,
    devoluciones,
    totalGastos,
    totalDevuelto,
    falta,
    sinAprobar,
    puedeCerrar: motivo === "",
    motivo,
  };
}

// --- Fondo de cada socio ---
// El dinero del Fondo está repartido en la parte de cada socio. Cada gasto, pago a operador o reparto sale de la parte
// de uno; cada entrada dice cuánto le toca a cada parte; y un socio le puede pasar dinero a otro (traspaso).
// La suma de las partes (más lo "sin asignar", que debería ser 0) es siempre el saldo total del Fondo.

export type Traspaso = {
  id: string;
  fecha: string;
  de_socio_id: string;
  a_socio_id: string;
  monto: number;
  nota: string | null;
  creado_por: string;
  created_at: string;
  aprobado_por: string | null;
  aprobado_en: string | null;
  rechazado_por: string | null;
  rechazado_en: string | null;
  motivo_rechazo: string | null;
};

export type EstadoTraspaso = "Por aprobar" | "Aprobado" | "Rechazado";

export function estadoTraspaso(t: Traspaso): EstadoTraspaso {
  if (t.rechazado_en) return "Rechazado";
  if (t.aprobado_en) return "Aprobado";
  return "Por aprobar";
}

export type FondoDeSocio = {
  socio_id: string;
  inicial: number;
  entradas: number;
  salidas: number;
  operadores: number;
  traspasoRecibido: number;
  traspasoEnviado: number;
  saldo: number;
  porPagar: number; // salidas aprobadas de su fondo que todavía no se pagan
};

export type SaldosPorSocio = {
  socios: FondoDeSocio[];
  sinAsignar: number; // movimientos viejos o pagos que no dicen de qué fondo son (debería ser 0)
  total: number; // suma de todo: debe ser igual a saldoFondo().saldo
};

export function saldoPorSocio(
  config: FondoConfig,
  movs: FondoMov[],
  pagosOp: PagoOp[],
  traspasos: Traspaso[],
  socioIds: string[]
): SaldosPorSocio {
  const desde = config.fecha_inicial;
  const cuenta = (fecha: string) => desde != null && fecha >= desde;
  const iniciales = config.saldos_socios ?? {};
  const mapa = new Map<string, FondoDeSocio>();
  for (const id of socioIds)
    mapa.set(id, {
      socio_id: id,
      inicial: iniciales[id] ?? 0,
      entradas: 0,
      salidas: 0,
      operadores: 0,
      traspasoRecibido: 0,
      traspasoEnviado: 0,
      saldo: 0,
      porPagar: 0,
    });
  const sumaIniciales = socioIds.reduce((t, id) => t + (iniciales[id] ?? 0), 0);
  let sinAsignar = config.saldo_inicial - sumaIniciales;

  const fondoDe = (m: FondoMov): string | null =>
    m.fondo_socio_id ?? (m.tipo === "Entrada" && m.categoria === CAT_APORTE ? m.socio_id : null);

  for (const m of movs) {
    if (m.origen !== "Fondo" || m.rechazado_en) continue;
    const f = fondoDe(m);
    const c = f ? mapa.get(f) : undefined;
    if (m.pagado_en) {
      if (!cuenta(m.fecha)) continue;
      const signo = m.tipo === "Entrada" ? 1 : -1;
      if (c) {
        if (m.tipo === "Entrada") c.entradas += m.monto;
        else c.salidas += m.monto;
      } else sinAsignar += signo * m.monto;
    } else if (m.tipo === "Salida" && m.aprobado_en && c) {
      c.porPagar += m.monto;
    }
  }
  for (const p of pagosOp) {
    if (p.fuera_del_fondo || !cuenta(p.fecha_pago)) continue;
    const c = p.fondo_socio_id ? mapa.get(p.fondo_socio_id) : undefined;
    if (c) c.operadores += p.neto;
    else sinAsignar -= p.neto;
  }
  for (const t of traspasos) {
    if (!t.aprobado_en || t.rechazado_en || !cuenta(t.fecha)) continue;
    const de = mapa.get(t.de_socio_id);
    const a = mapa.get(t.a_socio_id);
    if (de) de.traspasoEnviado += t.monto;
    if (a) a.traspasoRecibido += t.monto;
  }

  const socios = [...mapa.values()].map((c) => {
    const r = {
      ...c,
      inicial: redondear2(c.inicial),
      entradas: redondear2(c.entradas),
      salidas: redondear2(c.salidas),
      operadores: redondear2(c.operadores),
      traspasoRecibido: redondear2(c.traspasoRecibido),
      traspasoEnviado: redondear2(c.traspasoEnviado),
      porPagar: redondear2(c.porPagar),
    };
    return {
      ...r,
      saldo: redondear2(r.inicial + r.entradas - r.salidas - r.operadores + r.traspasoRecibido - r.traspasoEnviado),
    };
  });
  const sa = redondear2(sinAsignar);
  return { socios, sinAsignar: sa, total: redondear2(socios.reduce((t, s) => t + s.saldo, 0) + sa) };
}
