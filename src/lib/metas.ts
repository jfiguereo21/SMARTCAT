// Metas de facturación por corte (del 26 al 25). La meta es en pesos (RD$).
// El avance se mide con lo facturado: horas aprobadas × tarifa del acuerdo de cada día.
// Los dólares se pasan a pesos con la tasa del día 25 de ese corte (o la más reciente que haya).

import { acuerdoVigente, type Acuerdo } from "./machines";
import { aFecha, diaSemana, listaDias, sumarDias } from "./pagos";
import type { PreciosCorte } from "./combustible";

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type ConduceMeta = { machine_id: string; fecha: string; horas_cobrables: number; estado: string };

// Primer día del corte que termina el día 25 `clave`.
export function inicioDeCorte(clave: string): string {
  const [y, m] = clave.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return aFecha(py, pm, 26);
}

// Tasa del dólar a usar: la del corte; si no existe, la más reciente anterior; si no, la más reciente que haya.
export function tasaPara(clave: string, precios: PreciosCorte[]): number | null {
  const exacta = precios.find((p) => p.corte === clave);
  if (exacta) return exacta.tasa_dolar;
  const ordenados = [...precios].sort((a, b) => (a.corte < b.corte ? 1 : -1));
  return (ordenados.find((p) => p.corte < clave) ?? ordenados[0])?.tasa_dolar ?? null;
}

export type DiaAvance = {
  fecha: string;
  laborable: boolean; // lunes a sábado
  horas: number;
  facturado: number;
  acumulado: number;
  esperado: number; // lo que debería llevar acumulado ese día para cumplir la meta
};

export type Avance = {
  clave: string;
  inicio: string;
  meta: number | null;
  dias: DiaAvance[];
  facturado: number;
  horas: number;
  diasLaborables: number;
  transcurridos: number; // días laborables ya contados (hasta hoy si hoy ya tiene horas, si no hasta ayer)
  restantes: number;
  estado: "sin_meta" | "no_empieza" | "cumplida" | "por_encima" | "por_debajo" | "cerrado_sin_cumplir";
  esperadoHoy: number;
  diferencia: number; // facturado − esperado (positivo = adelantado)
  falta: number; // meta − facturado, nunca negativo
  promedioDia: number | null; // facturado por día laborable transcurrido
  necesarioPorDia: number | null; // lo que hay que facturar cada día laborable que queda para llegar a la meta
  proyeccion: number | null; // cómo cerrarías si sigues al ritmo de hoy
  tarifaPromedio: number | null; // facturado ÷ horas
  horasNecesariasPorDia: number | null;
  horasQueFaltan: number | null;
  dolaresSinTasa: boolean;
  pendientesHoras: number; // horas sin aprobar que todavía no cuentan
};

export function avanceCorte(
  clave: string,
  hoy: string,
  conduces: ConduceMeta[],
  acuerdos: Acuerdo[],
  precios: PreciosCorte[],
  meta: number | null
): Avance {
  const inicio = inicioDeCorte(clave);
  const dias = listaDias(inicio, clave);
  const tasa = tasaPara(clave, precios);
  const porDia = new Map<string, { horas: number; fact: number }>();
  let dolaresSinTasa = false;
  let pendientesHoras = 0;
  for (const c of conduces) {
    if (c.fecha < inicio || c.fecha > clave) continue;
    if (c.estado === "Pendiente") {
      pendientesHoras += c.horas_cobrables;
      continue;
    }
    if (c.estado !== "Aprobado") continue;
    const a = acuerdoVigente(acuerdos, c.machine_id, c.fecha);
    const d = porDia.get(c.fecha) ?? { horas: 0, fact: 0 };
    d.horas += c.horas_cobrables;
    if (a) {
      if (a.moneda === "USD") {
        if (tasa == null) dolaresSinTasa = true;
        else d.fact += c.horas_cobrables * a.tarifa * tasa;
      } else d.fact += c.horas_cobrables * a.tarifa;
    }
    porDia.set(c.fecha, d);
  }

  const laborables = dias.filter((f) => diaSemana(f) !== 0);
  const total = laborables.length;
  const hoyConHoras = (porDia.get(hoy)?.fact ?? 0) > 0;
  const ayer = sumarDias(hoy, -1);
  const corteTerminado = hoy > clave;
  const limite = corteTerminado ? clave : hoyConHoras ? hoy : ayer;
  const transcurridos = hoy < inicio ? 0 : laborables.filter((f) => f <= limite).length;

  let acum = 0;
  let horasTot = 0;
  let laborablesHastaAhora = 0;
  const filas: DiaAvance[] = dias.map((f) => {
    const lab = diaSemana(f) !== 0;
    if (lab) laborablesHastaAhora += 1;
    const d = porDia.get(f) ?? { horas: 0, fact: 0 };
    acum += d.fact;
    horasTot += d.horas;
    return {
      fecha: f,
      laborable: lab,
      horas: redondear2(d.horas),
      facturado: redondear2(d.fact),
      acumulado: redondear2(acum),
      esperado: meta != null && total > 0 ? redondear2((meta * laborablesHastaAhora) / total) : 0,
    };
  });
  const facturado = redondear2(acum);
  const horas = redondear2(horasTot);
  const restantes = Math.max(total - transcurridos, 0);
  const esperadoHoy = meta != null && total > 0 ? redondear2((meta * transcurridos) / total) : 0;
  const falta = meta != null ? Math.max(redondear2(meta - facturado), 0) : 0;
  const promedioDia = transcurridos > 0 ? redondear2(facturado / transcurridos) : null;
  const necesarioPorDia = meta != null && falta > 0 && restantes > 0 ? redondear2(falta / restantes) : null;
  const proyeccion = promedioDia != null ? redondear2(facturado + promedioDia * restantes) : null;
  const tarifaPromedio = horas > 0 ? redondear2(facturado / horas) : null;
  const horasNecesariasPorDia =
    necesarioPorDia != null && tarifaPromedio != null && tarifaPromedio > 0
      ? redondear2(necesarioPorDia / tarifaPromedio)
      : null;
  const horasQueFaltan =
    falta > 0 && tarifaPromedio != null && tarifaPromedio > 0 ? redondear2(falta / tarifaPromedio) : null;

  let estado: Avance["estado"];
  if (meta == null) estado = "sin_meta";
  else if (facturado >= meta) estado = "cumplida";
  else if (hoy < inicio) estado = "no_empieza";
  else if (corteTerminado) estado = "cerrado_sin_cumplir";
  else estado = facturado >= esperadoHoy ? "por_encima" : "por_debajo";

  return {
    clave,
    inicio,
    meta,
    dias: filas,
    facturado,
    horas,
    diasLaborables: total,
    transcurridos,
    restantes,
    estado,
    esperadoHoy,
    diferencia: redondear2(facturado - esperadoHoy),
    falta,
    promedioDia,
    necesarioPorDia,
    proyeccion,
    tarifaPromedio,
    horasNecesariasPorDia,
    horasQueFaltan,
    dolaresSinTasa,
    pendientesHoras: redondear2(pendientesHoras),
  };
}

// Facturado total de un corte (para comparar mes contra mes).
export function facturadoDeCorte(
  clave: string,
  conduces: ConduceMeta[],
  acuerdos: Acuerdo[],
  precios: PreciosCorte[]
): number {
  return avanceCorte(clave, "9999-12-31", conduces, acuerdos, precios, null).facturado;
}
