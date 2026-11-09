import { evaluarConsumo, type Evaluacion } from "./combustible";

export type EstadoLectura = "Pendiente" | "Aprobado" | "Rechazado";

export type LecturaHoro = {
  id: string;
  machine_id: string;
  creado_por: string;
  fecha: string; // AAAA-MM-DD
  lectura: number;
  foto_path: string;
  nota: string | null;
  estado: EstadoLectura;
  motivo_rechazo: string | null;
};

export const aLectura = (x: Record<string, unknown>): LecturaHoro => ({
  id: String(x.id),
  machine_id: String(x.machine_id),
  creado_por: String(x.creado_por),
  fecha: String(x.fecha),
  lectura: Number(x.lectura),
  foto_path: String(x.foto_path),
  nota: (x.nota as string | null) ?? null,
  estado: x.estado as EstadoLectura,
  motivo_rechazo: (x.motivo_rechazo as string | null) ?? null,
});

// Cuánto se permite que se separen las horas del horómetro y las de los conduces antes de avisar.
// El horómetro cuenta el motor prendido (incluye ralentí); el conduce cuenta lo que se cobra.
export const TOLERANCIA_CONDUCE_MAYOR = 0.05; // conduces por encima del horómetro: no debería pasar
export const TOLERANCIA_HOROMETRO_MAYOR = 0.2; // horómetro por encima de los conduces: motor prendido sin cobrar
export const MIN_DIFERENCIA_HORAS = 1; // diferencias menores a esto no se avisan

const redondear2 = (n: number) => Math.round(n * 100) / 100;

export type NivelCuadre =
  | "ok"
  | "conduce_mayor" // se cobraron más horas de las que marcó el horómetro
  | "horometro_mayor" // el motor trabajó más de lo que se cobró
  | "sin_movimiento"; // el horómetro no avanzó

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

type Conduce = { fecha: string; horas: number; aprobado: boolean };
type Carga = { fecha: string; galones: number };

// Cruza las lecturas aprobadas de una máquina: horas del horómetro, horas de los conduces y combustible
// entre cada par de lecturas seguidas. La lectura se toma al terminar el día, así que un tramo cuenta
// los días después de la lectura anterior hasta el día de la nueva, incluido.
export function cuadreMaquina(
  aprobadas: Pick<LecturaHoro, "fecha" | "lectura">[],
  conduces: Conduce[],
  cargas: Carga[],
  consumoEsperado: number | null
): TramoCuadre[] {
  const ordenadas = [...aprobadas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.lectura - b.lectura));
  const tramos: TramoCuadre[] = [];
  for (let i = 1; i < ordenadas.length; i++) {
    const a = ordenadas[i - 1];
    const b = ordenadas[i];
    const dentro = (f: string) => f > a.fecha && f <= b.fecha;
    const horasHorometro = redondear2(b.lectura - a.lectura);
    const horasConduce = redondear2(conduces.filter((c) => c.aprobado && dentro(c.fecha)).reduce((s, c) => s + c.horas, 0));
    const horasConducePendientes = redondear2(
      conduces.filter((c) => !c.aprobado && dentro(c.fecha)).reduce((s, c) => s + c.horas, 0)
    );
    const galones = redondear2(cargas.filter((c) => dentro(c.fecha)).reduce((s, c) => s + c.galones, 0));
    const diferencia = redondear2(horasHorometro - horasConduce);

    let nivel: NivelCuadre = "ok";
    if (horasHorometro <= 0) nivel = "sin_movimiento";
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

// Avisos para el administrador al revisar una lectura que espera aprobación.
export function avisosLectura(
  lectura: Pick<LecturaHoro, "fecha" | "lectura">,
  anterior: Pick<LecturaHoro, "fecha" | "lectura"> | null,
  horometroMaquina: number | null,
  conducesEntre: { aprobadas: number; pendientes: number } | null
): AvisoLectura[] {
  const avisos: AvisoLectura[] = [];
  if (horometroMaquina != null && lectura.lectura < horometroMaquina && (!anterior || lectura.fecha >= anterior.fecha)) {
    avisos.push({
      alerta: true,
      texto: `Marca menos que el horómetro que ya tiene la máquina (${horometroMaquina}). No se podrá aprobar: mira la foto, puede que el operador se equivocó al escribirla.`,
    });
  }
  if (!anterior) {
    avisos.push({ alerta: false, texto: "Es la primera lectura aprobada de esta máquina: sirve de punto de partida para el cuadre." });
    return avisos;
  }
  const horas = redondear2(lectura.lectura - anterior.lectura);
  if (horas > 0 && conducesEntre) {
    const conduce = conducesEntre.aprobadas + conducesEntre.pendientes;
    const dif = redondear2(horas - conduce);
    if (-dif > MIN_DIFERENCIA_HORAS && conduce > horas * (1 + TOLERANCIA_CONDUCE_MAYOR)) {
      avisos.push({
        alerta: true,
        texto: `Desde la lectura anterior el horómetro avanzó ${horas} h y los conduces suman ${redondear2(conduce)} h: se cobró más de lo que marcó el horómetro.`,
      });
    } else if (dif > MIN_DIFERENCIA_HORAS && horas > conduce * (1 + TOLERANCIA_HOROMETRO_MAYOR)) {
      avisos.push({
        alerta: true,
        texto: `Desde la lectura anterior el horómetro avanzó ${horas} h y los conduces suman ${redondear2(conduce)} h: el motor trabajó más de lo que se cobró.`,
      });
    } else {
      avisos.push({ alerta: false, texto: `Cuadra: horómetro ${horas} h contra conduces ${redondear2(conduce)} h.` });
    }
  }
  return avisos;
}
