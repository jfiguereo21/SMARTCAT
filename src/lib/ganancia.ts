// Ganancia por máquina en un corte (del 26 al 25), todo en pesos (RD$).
// Entra: horas × tarifa del acuerdo, menos el combustible que dio el cliente (lo mismo que muestra Corte).
// Sale: pago del operador por horas, su dieta y combustible, el combustible de la máquina, lo que se le paga
// al dueño si es subcontratada y los gastos del Fondo marcados con esa máquina.
// Las horas de piscinas (trabajos a precio cerrado) no entran: esas se ven en Trabajos.

import { acuerdoVigente, type Acuerdo, type Machine, type Moneda } from "./machines";
import { corteDe } from "./conduces";
import type { PreciosCorte } from "./combustible";
import { armarCorte, claveCorte, pagoDuenos, type CargaCorte } from "./corte";
import { redondear2 } from "./combustible";
import { CAT_PRESTAMO, CAT_REEMBOLSO, CAT_REPARTO } from "./fondo";
import type { CostoDia } from "./trabajos";

export type ConduceGanancia = {
  machine_id: string;
  fecha: string;
  horas_cobrables: number;
  estado: string;
  creado_por: string | null;
  parte_id: string | null;
};

export type GastoFondo = {
  fecha: string;
  tipo: string;
  categoria: string;
  monto: number;
  machine_id: string | null;
  rechazado: boolean;
  aprobado: boolean;
};

// Categorías del Fondo que se cargan a la máquina. El combustible ya se cuenta con sus cargas,
// y el seguro, los impuestos, los reembolsos y los repartos no son gasto de operar la máquina.
export const CATEGORIAS_MAQUINA = ["Mantenimiento y repuestos", "Transporte", "GPS", "Otro gasto"];

export type GananciaMaquina = {
  machineId: string;
  maquina: string;
  horas: number;
  ingreso: number; // RD$, ya sin el combustible del cliente
  operadorHoras: number;
  operadorCampo: number; // dieta y combustible del operador
  combustible: number; // combustible que pagamos nosotros
  dueno: number;
  gastos: number; // gastos del Fondo con esta máquina
  gastosPorAprobar: number; // cuánto de los gastos aún no lo aprueba el otro socio (ya está sumado arriba)
  seguro: number; // el seguro de la máquina, un doceavo de la prima por corte
  prestamosSociedad: number; // cuotas de préstamos de la sociedad (solo en el total, no en cada máquina)
  costo: number;
  ganancia: number; // ganancia de operar la máquina, antes de la cuota del préstamo
  porcentaje: number | null; // ganancia entre ingreso
  cuota: number; // cuota del préstamo que cae en este corte (RD$)
  cuotaNota: string | null; // por ejemplo "cuota 2 de 18"
  tienePrestamo: boolean;
  gananciaFinal: number; // lo que queda después de la cuota
  porcentajeFinal: number | null;
  cuotaRegistrada: boolean; // la cuota de este corte ya se anotó en el Fondo
  costoCompra: { monto: number; moneda: Moneda } | null;
  compraPendiente: { monto: number; moneda: Moneda } | null; // lo que falta por pagar de la compra
  pctCosto: number | null; // lo que operar dejó este corte, en % de lo que costó la máquina
  avisos: string[];
};

export type ResultadoGanancia = {
  inicio: string;
  fin: string;
  maquinas: GananciaMaquina[];
  total: Omit<GananciaMaquina, "machineId" | "maquina" | "avisos"> & { avisos: string[] };
  sinMaquina: { operador: number; gastos: number }; // costos que no se pudieron asignar a ninguna máquina
  // Cuotas de préstamos de la sociedad anotadas en el Fondo sin máquina (por ejemplo los préstamos personales de un socio).
  prestamos: { monto: number; cantidad: number };
  tasaDolar: number | null;
};

export function rangoCorte(clave: string): { inicio: string; fin: string } {
  const [y, m] = clave.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 2, 26)).toISOString().slice(0, 10);
  return { inicio, fin: clave };
}

// Fechas en que se paga cada cuota: el mismo día de cada mes desde la primera (si el mes no tiene ese día, el último).
export function fechasCuotas(primera: string, dia: number, cuotas: number): string[] {
  const [y, m] = primera.split("-").map(Number);
  const out: string[] = [];
  for (let k = 0; k < cuotas; k++) {
    const ultimo = new Date(Date.UTC(y, m - 1 + k + 1, 0)).getUTCDate();
    out.push(new Date(Date.UTC(y, m - 1 + k, Math.min(dia, ultimo))).toISOString().slice(0, 10));
  }
  return out;
}

export function calcularGanancia(e: {
  clave: string;
  maquinas: Machine[];
  conduces: ConduceGanancia[];
  cargas: CargaCorte[];
  acuerdos: Acuerdo[];
  precio: PreciosCorte | null;
  operadores: Map<string, Map<string, CostoDia>>; // por operador, por fecha
  fondo: GastoFondo[];
}): ResultadoGanancia {
  const { clave } = e;
  const { inicio, fin } = rangoCorte(clave);
  const tasa = e.precio?.tasa_dolar ?? null;
  const delCorte = (machineId: string, fecha: string) => claveCorte(fecha, acuerdoVigente(e.acuerdos, machineId, fecha)) === clave;

  const filas = new Map<string, GananciaMaquina>();
  const fila = (m: Pick<Machine, "id" | "nombre">): GananciaMaquina => {
    let f = filas.get(m.id);
    if (!f) {
      f = {
        machineId: m.id,
        maquina: m.nombre,
        horas: 0,
        ingreso: 0,
        operadorHoras: 0,
        operadorCampo: 0,
        combustible: 0,
        dueno: 0,
        gastos: 0,
        gastosPorAprobar: 0,
        seguro: 0,
        prestamosSociedad: 0,
        costo: 0,
        ganancia: 0,
        porcentaje: null,
        cuota: 0,
        cuotaNota: null,
        tienePrestamo: false,
        gananciaFinal: 0,
        porcentajeFinal: null,
        cuotaRegistrada: false,
        costoCompra: null,
        compraPendiente: null,
        pctCosto: null,
        avisos: [],
      };
      filas.set(m.id, f);
    }
    return f;
  };
  const maqDe = (id: string) => e.maquinas.find((m) => m.id === id);
  const aviso = (f: GananciaMaquina, t: string) => {
    if (!f.avisos.includes(t)) f.avisos.push(t);
  };

  // --- Lo que entra: igual que Corte ---
  const porHora = e.conduces.filter((c) => !c.parte_id);
  const corte = armarCorte(clave, e.maquinas, porHora, e.cargas, e.acuerdos, e.precio);
  for (const g of corte.grupos) {
    for (const l of g.lineas) {
      const m = maqDe(l.machineId);
      if (!m) continue;
      const f = fila(m);
      f.horas += l.horas;
      const valor = l.neto ?? l.bruto;
      if (l.neto == null) aviso(f, "Falta el precio del diésel del día 25 para descontar el combustible del cliente.");
      if (l.moneda === "USD") {
        if (tasa == null) aviso(f, "Falta la tasa del dólar de este corte: lo cobrado en dólares no está contado.");
        else f.ingreso += valor * tasa;
      } else f.ingreso += valor;
    }
  }
  for (const h of corte.horasSinAcuerdo) {
    const m = maqDe(h.machineId);
    if (m) aviso(fila(m), `${h.horas} h sin acuerdo de tarifa: no están cobradas.`);
  }

  // --- Operadores: el costo de cada día va a la máquina donde trabajó ---
  const aprobados = e.conduces.filter((c) => c.estado === "Aprobado" && c.creado_por);
  const sinMaquina = { operador: 0, gastos: 0 };
  for (const [uid, dias] of e.operadores) {
    const suyos = aprobados.filter((c) => c.creado_por === uid).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    for (const [fecha, costo] of dias) {
      if (costo.pago + costo.campo <= 0) continue;
      const delDia = suyos.filter((c) => c.fecha === fecha);
      const horasDia = delDia.reduce((t, c) => t + c.horas_cobrables, 0);
      const partes: { machineId: string; parteId: string | null; peso: number }[] = [];
      if (horasDia > 0) {
        for (const c of delDia) partes.push({ machineId: c.machine_id, parteId: c.parte_id, peso: c.horas_cobrables / horasDia });
      } else {
        // Día sin conduce (máquina dañada, taller...): va a la máquina de su conduce más cercano, antes o después.
        const antes = [...suyos].reverse().find((c) => c.fecha < fecha);
        const despues = suyos.find((c) => c.fecha > fecha);
        const ref = antes ?? despues;
        if (ref) partes.push({ machineId: ref.machine_id, parteId: null, peso: 1 });
        else if (corteDe(fecha).clave === clave) sinMaquina.operador += costo.pago + costo.campo;
      }
      for (const p of partes) {
        if (p.parteId) continue; // las piscinas se ven en Trabajos
        if (!delCorte(p.machineId, fecha)) continue;
        const m = maqDe(p.machineId);
        if (!m) continue;
        const f = fila(m);
        f.operadorHoras += costo.pago * p.peso;
        f.operadorCampo += costo.campo * p.peso;
      }
    }
  }

  // --- Combustible propio y pago al dueño ---
  const duenos = pagoDuenos(clave, e.maquinas, porHora, e.cargas, e.precio);
  for (const d of duenos) {
    const m = maqDe(d.machineId);
    if (!m) continue;
    const f = fila(m);
    // Si se le descuenta el combustible al dueño, el costo real es el bruto menos lo que el cliente echó.
    f.dueno += d.descuentaCombustible ? d.bruto - (d.descuentoCliente ?? 0) : d.bruto;
    if (d.descuentaCombustible && d.descuentoCliente == null) aviso(f, "Falta el precio del diésel del día 25: el pago al dueño puede estar alto.");
  }
  for (const c of e.cargas) {
    if (c.estado !== "Aprobado" || c.origen === "Cliente" || !delCorte(c.machine_id, c.fecha)) continue;
    const m = maqDe(c.machine_id);
    if (!m) continue;
    const d = duenos.find((x) => x.machineId === c.machine_id);
    if (d?.descuentaCombustible) continue; // ya va dentro de lo que se le paga al dueño
    const f = fila(m);
    if (c.monto == null) aviso(f, "Hay cargas de combustible sin precio: no están contadas.");
    else if (c.moneda === "USD") {
      if (tasa == null) aviso(f, "Hay combustible en dólares y falta la tasa del corte.");
      else f.combustible += c.monto * tasa;
    } else f.combustible += c.monto;
  }

  // --- Gastos del Fondo marcados con una máquina ---
  for (const g of e.fondo) {
    if (g.rechazado || g.tipo !== "Salida" || g.categoria === CAT_REEMBOLSO || g.categoria === CAT_REPARTO) continue;
    if (!CATEGORIAS_MAQUINA.includes(g.categoria)) continue;
    if (!g.machine_id) {
      if (g.fecha >= inicio && g.fecha <= fin) sinMaquina.gastos += g.monto;
      continue;
    }
    if (!delCorte(g.machine_id, g.fecha)) continue;
    const m = maqDe(g.machine_id);
    if (!m) continue;
    const f = fila(m);
    f.gastos += g.monto;
    if (!g.aprobado) f.gastosPorAprobar += g.monto;
  }

  // --- Préstamo de la máquina: la cuota que cae dentro del corte ---
  for (const m of e.maquinas) {
    const f = filas.get(m.id);
    if (!f) continue;
    const cuotaMonto = Number(m.prestamo_cuota ?? 0);
    if (cuotaMonto > 0 && m.prestamo_primera && m.prestamo_dia && m.prestamo_cuotas) {
      f.tienePrestamo = true;
      const fechas = fechasCuotas(m.prestamo_primera, Number(m.prestamo_dia), Number(m.prestamo_cuotas));
      const total = fechas.length;
      const enCorte = fechas.map((d, i) => ({ d, n: i + 1 })).filter((x) => x.d >= inicio && x.d <= fin);
      if (enCorte.length > 0) {
        if (m.prestamo_moneda === "USD" && tasa == null) {
          aviso(f, "Falta la tasa del dólar de este corte: la cuota del préstamo no está restada.");
        } else {
          f.cuota = enCorte.length * cuotaMonto * (m.prestamo_moneda === "USD" ? (tasa as number) : 1);
          f.cuotaNota = enCorte.length === 1 ? `cuota ${enCorte[0].n} de ${total}` : `cuotas ${enCorte[0].n} a ${enCorte[enCorte.length - 1].n} de ${total}`;
        }
      }
    }
    f.cuotaRegistrada = e.fondo.some(
      (g) => !g.rechazado && g.tipo === "Salida" && g.categoria === CAT_PRESTAMO && g.machine_id === m.id && g.fecha >= inicio && g.fecha <= fin
    );
    const costoNum = Number(m.costo_compra ?? 0);
    if (costoNum > 0) f.costoCompra = { monto: costoNum, moneda: m.costo_moneda ?? "USD" };
    const pend = Number(m.compra_pendiente ?? 0);
    if (pend > 0) f.compraPendiente = { monto: pend, moneda: m.costo_moneda ?? "USD" };
    // Seguro: un doceavo de la prima en cada corte.
    const prima = Number(m.seguro_prima_anual ?? 0);
    if (prima > 0) {
      if (m.seguro_moneda === "USD" && tasa == null) aviso(f, "Falta la tasa del dólar de este corte: el seguro no está restado.");
      else f.seguro = (prima / 12) * (m.seguro_moneda === "USD" ? (tasa as number) : 1);
    }
  }

  // --- Totales ---
  const maquinas = [...filas.values()].sort((a, b) => a.maquina.localeCompare(b.maquina));
  for (const f of maquinas) {
    f.horas = redondear2(f.horas);
    f.ingreso = redondear2(f.ingreso);
    f.operadorHoras = redondear2(f.operadorHoras);
    f.operadorCampo = redondear2(f.operadorCampo);
    f.combustible = redondear2(f.combustible);
    f.dueno = redondear2(f.dueno);
    f.gastos = redondear2(f.gastos);
    f.gastosPorAprobar = redondear2(f.gastosPorAprobar);
    f.seguro = redondear2(f.seguro);
    f.costo = redondear2(f.operadorHoras + f.operadorCampo + f.combustible + f.dueno + f.gastos + f.seguro);
    f.ganancia = redondear2(f.ingreso - f.costo);
    f.porcentaje = f.ingreso > 0 ? redondear2((f.ganancia / f.ingreso) * 100) : null;
    f.cuota = redondear2(f.cuota);
    f.gananciaFinal = redondear2(f.ganancia - f.cuota);
    f.porcentajeFinal = f.ingreso > 0 ? redondear2((f.gananciaFinal / f.ingreso) * 100) : null;
    if (f.costoCompra) {
      const costoDop = f.costoCompra.moneda === "USD" ? (tasa == null ? null : f.costoCompra.monto * tasa) : f.costoCompra.monto;
      f.pctCosto = costoDop ? redondear2((f.ganancia / costoDop) * 100) : null;
    }
  }
  const suma = (k: "horas" | "cuota" | "seguro" | "ingreso" | "operadorHoras" | "operadorCampo" | "combustible" | "dueno" | "gastos" | "gastosPorAprobar") =>
    redondear2(maquinas.reduce((t, f) => t + f[k], 0));
  const ingreso = suma("ingreso");
  // Cuotas de préstamos de la sociedad (por ejemplo los de Francisco) anotadas en el Fondo sin máquina: son un gasto del total.
  const prestamosFondo = e.fondo.filter(
    (g) => !g.rechazado && g.tipo === "Salida" && g.categoria === CAT_PRESTAMO && !g.machine_id && g.fecha >= inicio && g.fecha <= fin
  );
  const prestamosMonto = redondear2(prestamosFondo.reduce((t, g) => t + g.monto, 0));
  const costo = redondear2(maquinas.reduce((t, f) => t + f.costo, 0) + prestamosMonto);
  const ganancia = redondear2(ingreso - costo);
  const cuotaTotal = suma("cuota");
  return {
    inicio,
    fin,
    maquinas,
    total: {
      horas: suma("horas"),
      ingreso,
      operadorHoras: suma("operadorHoras"),
      operadorCampo: suma("operadorCampo"),
      combustible: suma("combustible"),
      dueno: suma("dueno"),
      gastos: suma("gastos"),
      gastosPorAprobar: suma("gastosPorAprobar"),
      seguro: suma("seguro"),
      prestamosSociedad: prestamosMonto,
      costo,
      ganancia,
      porcentaje: ingreso > 0 ? redondear2((ganancia / ingreso) * 100) : null,
      cuota: cuotaTotal,
      cuotaNota: null,
      tienePrestamo: maquinas.some((f) => f.tienePrestamo),
      gananciaFinal: redondear2(ganancia - cuotaTotal),
      porcentajeFinal: ingreso > 0 ? redondear2(((ganancia - cuotaTotal) / ingreso) * 100) : null,
      cuotaRegistrada: false,
      costoCompra: null,
      compraPendiente: null,
      pctCosto: null,
      avisos: [...new Set(maquinas.flatMap((f) => f.avisos))],
    },
    sinMaquina: { operador: redondear2(sinMaquina.operador), gastos: redondear2(sinMaquina.gastos) },
    prestamos: { monto: prestamosMonto, cantidad: prestamosFondo.length },
    tasaDolar: tasa,
  };
}

