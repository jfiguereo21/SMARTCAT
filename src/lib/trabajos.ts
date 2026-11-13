// Trabajos a precio cerrado (por ejemplo, 4 piscinas a RD$30,000 cada una).
// Se cobra por piscina terminada, no por hora. Para saber cuánto se ganó, a cada piscina se le suma lo que costó:
// el pago del operador (horas, dieta y combustible del operador), el combustible de la máquina y,
// si la máquina es subcontratada, lo que se le paga al dueño. Todo en pesos (RD$).

import {
  calcularDias,
  mapaAjustes,
  redondear2,
  type AjusteRow,
  type PerfilPago,
  type ReporteDiaRow,
  type TratoRow,
} from "./pagos";

export type Trabajo = {
  id: string;
  nombre: string;
  client_id: string | null;
  obra: string | null;
  machine_id: string;
  fecha_inicio: string;
  estado: "Abierto" | "Cerrado";
  notas: string | null;
};

export type Parte = {
  id: string;
  trabajo_id: string;
  nombre: string;
  precio: number;
  orden: number;
  terminada_en: string | null;
};

export const aTrabajo = (x: Record<string, unknown>): Trabajo => ({
  id: String(x.id),
  nombre: String(x.nombre),
  client_id: (x.client_id as string | null) ?? null,
  obra: (x.obra as string | null) ?? null,
  machine_id: String(x.machine_id),
  fecha_inicio: String(x.fecha_inicio),
  estado: (x.estado as "Abierto" | "Cerrado") ?? "Abierto",
  notas: (x.notas as string | null) ?? null,
});

export const aParte = (x: Record<string, unknown>): Parte => ({
  id: String(x.id),
  trabajo_id: String(x.trabajo_id),
  nombre: String(x.nombre),
  precio: Number(x.precio),
  orden: Number(x.orden ?? 0),
  terminada_en: (x.terminada_en as string | null) ?? null,
});

export type ConduceTrabajo = {
  id: string;
  numero: number;
  libreta: string;
  fecha: string;
  machine_id: string;
  horas_cobrables: number;
  estado: string;
  creado_por: string | null;
  parte_id: string | null;
  parte_terminada: boolean;
};

export type CargaTrabajo = {
  machine_id: string;
  fecha: string;
  galones: number;
  origen: string;
  estado: string;
  monto: number | null;
  moneda: string | null;
};

export type MaquinaCosto = {
  propiedad: string;
  pago_dueno: number | null;
  descuenta_combustible_dueno: boolean;
  dueno_user_id: string | null;
};

// Lo que cuesta un día de un operador: lo pagado por horas y su dieta y combustible.
export type CostoDia = { pago: number; campo: number; horasConduce: number };

export type DatosOperadorCosto = {
  perfil: PerfilPago;
  tratos: TratoRow[];
  ajustes: AjusteRow[];
  reportes: ReporteDiaRow[];
  conduces: { fecha: string; horas: number; aprobado: boolean }[];
};

export function costoDiasOperador(d: DatosOperadorCosto, feriados: Record<string, string>, hoy: string): Map<string, CostoDia> {
  const out = new Map<string, CostoDia>();
  if (!d.perfil.paga_desde) return out;
  const dias = calcularDias({
    inicio: d.perfil.paga_desde,
    fin: hoy,
    pagaDesde: d.perfil.paga_desde,
    hoy,
    conduces: d.conduces,
    feriados,
    ajustes: mapaAjustes(d.ajustes, d.reportes),
    trato: d.perfil,
    tratos: d.tratos,
  });
  for (const x of dias) {
    const tarifa = x.tarifa ?? d.perfil.tarifa_hora ?? 0;
    out.set(x.fecha, {
      pago: x.horasPagadas * tarifa,
      campo: x.fueAlCampo ? x.dieta + x.combustible : 0,
      horasConduce: x.horasConduce,
    });
  }
  return out;
}

export type CostoParte = {
  horas: number;
  operador: number;
  combustible: number;
  dueno: number;
  total: number;
  incompleto: boolean; // falta el precio de alguna carga de combustible o de dólares
};

const vacio = (): CostoParte => ({ horas: 0, operador: 0, combustible: 0, dueno: 0, total: 0, incompleto: false });

export type ResultadoCostos = {
  porParte: Map<string, CostoParte>;
  sinAsignar: CostoParte; // horas de la máquina en el trabajo que no se han puesto en ninguna piscina
  combustiblePorHora: number | null; // costo de combustible por hora de máquina (pesos)
};

// Reparte los costos del trabajo entre sus partes.
export function costosTrabajo(e: {
  trabajo: Trabajo;
  partes: Parte[];
  maquina: MaquinaCosto;
  conduces: ConduceTrabajo[]; // de la máquina del trabajo
  cargas: CargaTrabajo[]; // de la máquina del trabajo
  operadores: Map<string, Map<string, CostoDia>>; // por operador, por fecha
  tasaDolar: number | null;
  hoy: string;
}): ResultadoCostos {
  const desde = e.trabajo.fecha_inicio;
  const aprobados = e.conduces.filter((c) => c.estado === "Aprobado" && c.fecha >= desde && c.fecha <= e.hoy);
  const porParte = new Map<string, CostoParte>(e.partes.map((p) => [p.id, vacio()]));
  const sinAsignar = vacio();

  // Combustible: lo que costaron las cargas propias del periodo, repartido entre todas las horas de la máquina.
  const horasMaquina = aprobados.reduce((a, c) => a + c.horas_cobrables, 0);
  let costoComb = 0;
  let combIncompleto = false;
  const maquinaPagaComb = !(e.maquina.pago_dueno != null && e.maquina.descuenta_combustible_dueno);
  if (maquinaPagaComb) {
    for (const g of e.cargas) {
      if (g.estado !== "Aprobado" || g.origen === "Cliente" || g.fecha < desde || g.fecha > e.hoy) continue;
      if (g.monto == null) combIncompleto = true;
      else if (g.moneda === "USD") {
        if (e.tasaDolar == null) combIncompleto = true;
        else costoComb += g.monto * e.tasaDolar;
      } else costoComb += g.monto;
    }
  }
  const combPorHora = horasMaquina > 0 ? costoComb / horasMaquina : 0;

  for (const c of aprobados) {
    const destino = c.parte_id && porParte.has(c.parte_id) ? porParte.get(c.parte_id)! : sinAsignar;
    destino.horas += c.horas_cobrables;
    // Operador: el costo de su día, repartido entre sus conduces de ese día por horas.
    const dia = c.creado_por ? e.operadores.get(c.creado_por)?.get(c.fecha) : undefined;
    if (dia && dia.horasConduce > 0) destino.operador += (dia.pago + dia.campo) * (c.horas_cobrables / dia.horasConduce);
    destino.combustible += c.horas_cobrables * combPorHora;
    if (combIncompleto) destino.incompleto = true;
    if (e.maquina.pago_dueno != null) destino.dueno += c.horas_cobrables * e.maquina.pago_dueno;
  }
  for (const v of [...porParte.values(), sinAsignar]) {
    v.horas = redondear2(v.horas);
    v.operador = redondear2(v.operador);
    v.combustible = redondear2(v.combustible);
    v.dueno = redondear2(v.dueno);
    v.total = redondear2(v.operador + v.combustible + v.dueno);
  }
  return { porParte, sinAsignar, combustiblePorHora: horasMaquina > 0 ? redondear2(combPorHora) : null };
}
