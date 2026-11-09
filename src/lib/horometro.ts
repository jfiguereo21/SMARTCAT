import { evaluarConsumo, type Evaluacion } from "./combustible";

// El horómetro se anota en el mismo reporte del día (conduce): lo que marca el reloj al terminar el día.
export type PuntoHoro = { fecha: string; lectura: number };

// Cuánto se permite que se separen las horas del horómetro y las de los conduces antes de avisar.
// El horómetro cuenta el motor prendido (incluye ralentí); el conduce cuenta lo que se cobra.
export const TOLERANCIA_CONDUCE_MAYOR = 0.05; // conduces por encima del horómetro: no debería pasar
export const TOLERANCIA_HOROMETRO_MAYOR = 0.2; // horómetro por encima de los conduces: motor prendido sin cobrar
export const MIN_DIFERENCIA_HORAS = 1; // diferencias menores a esto no se avisan

const redondear2 = (n: number) => Math.round(n * 100) / 100;

type ConduceHoro = {
  id: string;
  machine_id: string;
  fecha: string;
  horas: number; // horas cobrables
  estado: string; // Pendiente | Aprobado | Rechazado
  horometro: number | null;
};

// Un punto por día y por máquina: si hay varios conduces el mismo día, vale el que marca más
// (la lectura del final del día). Solo cuentan los conduces aprobados.
export function puntosAprobados(conduces: ConduceHoro[], machineId: string): PuntoHoro[] {
  const porDia = new Map<string, number>();
  for (const c of conduces) {
    if (c.machine_id !== machineId || c.estado !== "Aprobado" || c.horometro == null) continue;
    porDia.set(c.fecha, Math.max(porDia.get(c.fecha) ?? 0, c.horometro));
  }
  return [...porDia.entries()].map(([fecha, lectura]) => ({ fecha, lectura })).sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

export type NivelCuadre =
  | "ok"
  | "conduce_mayor" // se cobraron más horas de las que marcó el horómetro
  | "horometro_mayor" // el motor trabajó más de lo que se cobró
  | "sin_movimiento" // el horómetro no avanzó
  | "retroceso"; // el horómetro marca menos que la lectura anterior

export type TramoCuadre = {
  desde: string; // fecha de la lectura anterior
  hasta: string; // fecha de la lectura nueva
  lecturaDesde: number;
  lecturaHasta: number;
  horasHorometro: number;
  horasConduce: number; // conduces aprobados entre las dos lecturas
  horasConducePendientes: number; // conduces por aprobar: todavía no cuentan
  diferencia: number; // horómetro menos conduces
  galones: number; // combustible aprobado entre las dos lecturas
  nivel: NivelCuadre;
  consumo: Evaluacion; // galones por hora del horómetro contra lo normal de la máquina
};

type HorasDia = { fecha: string; horas: number; aprobado: boolean };
type Carga = { fecha: string; galones: number };

// Cruza las lecturas de una máquina: horas del horómetro, horas de los conduces y combustible
// entre cada par de lecturas seguidas. La lectura se toma al terminar el día, así que un tramo cuenta
// los días después de la lectura anterior hasta el día de la nueva, incluido.
export function cuadreMaquina(
  puntos: PuntoHoro[],
  conduces: HorasDia[],
  cargas: Carga[],
  consumoEsperado: number | null
): TramoCuadre[] {
  const ordenados = [...puntos].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.lectura - b.lectura));
  const tramos: TramoCuadre[] = [];
  for (let i = 1; i < ordenados.length; i++) {
    const a = ordenados[i - 1];
    const b = ordenados[i];
    const dentro = (f: string) => f > a.fecha && f <= b.fecha;
    const horasHorometro = redondear2(b.lectura - a.lectura);
    const horasConduce = redondear2(conduces.filter((c) => c.aprobado && dentro(c.fecha)).reduce((s, c) => s + c.horas, 0));
    const horasConducePendientes = redondear2(
      conduces.filter((c) => !c.aprobado && dentro(c.fecha)).reduce((s, c) => s + c.horas, 0)
    );
    const galones = redondear2(cargas.filter((c) => dentro(c.fecha)).reduce((s, c) => s + c.galones, 0));
    const diferencia = redondear2(horasHorometro - horasConduce);

    let nivel: NivelCuadre = "ok";
    if (horasHorometro < 0) nivel = "retroceso";
    else if (horasHorometro === 0) nivel = "sin_movimiento";
    else if (-diferencia > MIN_DIFERENCIA_HORAS && horasConduce > horasHorometro * (1 + TOLERANCIA_CONDUCE_MAYOR)) nivel = "conduce_mayor";
    else if (diferencia > MIN_DIFERENCIA_HORAS && horasHorometro > horasConduce * (1 + TOLERANCIA_HOROMETRO_MAYOR)) nivel = "horometro_mayor";

    tramos.push({
      desde: a.fecha,
      hasta: b.fecha,
      lecturaDesde: a.lectura,
      lecturaHasta: b.lectura,
      horasHorometro,
      horasConduce,
      horasConducePendientes,
      diferencia,
      galones,
      nivel,
      consumo: evaluarConsumo(galones, Math.max(horasHorometro, 0), consumoEsperado, []),
    });
  }
  return tramos;
}

export type AvisoLectura = { alerta: boolean; texto: string };

// Avisos para el administrador al revisar el horómetro de un conduce.
// `todos` son los conduces (cualquier estado menos rechazado); `horometroMaquina` es lo que ya marca la máquina.
export function avisosConduce(
  actual: { id: string; machine_id: string; fecha: string; horometro: number | null },
  todos: ConduceHoro[],
  horometroMaquina: number | null
): AvisoLectura[] {
  if (actual.horometro == null) return [{ alerta: true, texto: "Este conduce no trae lo que marca el horómetro." }];
  const avisos: AvisoLectura[] = [];

  // Si hay otro conduce el mismo día que marca más, ese es el del final del día: el cuadre usa ese.
  const mismoDiaMayor = todos.some(
    (c) => c.id !== actual.id && c.machine_id === actual.machine_id && c.fecha === actual.fecha && c.estado !== "Rechazado" && (c.horometro ?? 0) > actual.horometro!
  );

  const anterior =
    todos
      .filter((c) => c.id !== actual.id && c.machine_id === actual.machine_id && c.estado === "Aprobado" && c.horometro != null && c.fecha < actual.fecha)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.horometro ?? 0) - (a.horometro ?? 0)))[0] ?? null;

  if (horometroMaquina != null && actual.horometro < horometroMaquina && (!anterior || actual.fecha >= anterior.fecha)) {
    // Solo molesta si esta lectura es de lo más reciente.
    const hayMasNueva = todos.some((c) => c.id !== actual.id && c.machine_id === actual.machine_id && c.estado === "Aprobado" && c.horometro != null && c.fecha > actual.fecha);
    if (!hayMasNueva) {
      avisos.push({
        alerta: true,
        texto: `Marca menos que el horómetro que ya tiene la máquina (${horometroMaquina}). Mira la foto: puede que el operador se equivocó al escribirlo.`,
      });
    }
  }

  if (!anterior) {
    avisos.push({ alerta: false, texto: "No hay una lectura anterior aprobada de esta máquina: esta sirve de punto de partida para el cuadre." });
    return avisos;
  }

  if (actual.horometro < anterior.horometro!) {
    avisos.push({
      alerta: true,
      texto: `Marca menos que la lectura anterior (${anterior.horometro}, del ${anterior.fecha}). Mira la foto: el horómetro no puede bajar.`,
    });
    return avisos;
  }

  if (mismoDiaMayor) {
    avisos.push({ alerta: false, texto: "Hay otro conduce de este mismo día que marca más: el cuadre usa ese, el del final del día." });
    return avisos;
  }

  const horas = redondear2(actual.horometro - anterior.horometro!);
  const entre = todos.filter(
    (c) => c.machine_id === actual.machine_id && c.estado !== "Rechazado" && c.fecha > anterior.fecha && c.fecha <= actual.fecha
  );
  const conduce = redondear2(entre.reduce((s, c) => s + c.horas, 0));
  const dif = redondear2(horas - conduce);
  if (-dif > MIN_DIFERENCIA_HORAS && conduce > horas * (1 + TOLERANCIA_CONDUCE_MAYOR)) {
    avisos.push({
      alerta: true,
      texto: `Desde la lectura anterior el horómetro avanzó ${horas} h y los conduces suman ${conduce} h: se cobró más de lo que marcó el horómetro.`,
    });
  } else if (dif > MIN_DIFERENCIA_HORAS && horas > conduce * (1 + TOLERANCIA_HOROMETRO_MAYOR)) {
    avisos.push({
      alerta: true,
      texto: `Desde la lectura anterior el horómetro avanzó ${horas} h y los conduces suman ${conduce} h: el motor trabajó más de lo que se cobró.`,
    });
  } else {
    avisos.push({ alerta: false, texto: `Cuadra: horómetro ${horas} h contra conduces ${conduce} h.` });
  }
  return avisos;
}
