// Mantenimiento por horas: cada máquina se revisa cada 250 horas de trabajo (lo que marca el horómetro).
// El próximo mantenimiento toca a las horas del último servicio + 250.

export const INTERVALO_MANTENIMIENTO = 250;
export const AVISO_PROXIMO = 25; // desde que faltan 25 horas o menos, se avisa que ya viene

export type Mantenimiento = {
  id: string;
  machine_id: string;
  fecha: string;
  horometro: number;
  nota: string | null;
};

export const aMantenimiento = (x: Record<string, unknown>): Mantenimiento => ({
  id: String(x.id),
  machine_id: String(x.machine_id),
  fecha: String(x.fecha),
  horometro: Number(x.horometro),
  nota: (x.nota as string | null) ?? null,
});

export type NivelMant = "vencido" | "proximo" | "al_dia" | "sin_dato";

export type EstadoMant = {
  nivel: NivelMant;
  ultimo: Mantenimiento | null; // el último servicio registrado (el de más horas)
  desdeHoras: number | null; // horas a las que se hizo el último servicio (0 si nunca se ha dado y la máquina es nueva)
  proximoEn: number | null; // horas del horómetro en las que toca el próximo
  faltan: number | null; // horas que faltan (negativo = ya se pasó)
  avance: number; // 0 a 1+: qué parte del intervalo ya se trabajó
  resumen: string; // frase corta para el operador/administrador
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(r1(n)).replace(".", ",");

export function estadoMantenimiento(
  horometro: number | null,
  servicios: Mantenimiento[],
  intervalo: number = INTERVALO_MANTENIMIENTO
): EstadoMant {
  const ultimo = servicios.length ? servicios.reduce((a, b) => (b.horometro >= a.horometro ? b : a)) : null;
  const sinDato: EstadoMant = {
    nivel: "sin_dato",
    ultimo,
    desdeHoras: null,
    proximoEn: null,
    faltan: null,
    avance: 0,
    resumen: "",
  };
  if (horometro == null) return { ...sinDato, resumen: "Falta el horómetro de la máquina." };

  let desde: number;
  if (ultimo) desde = ultimo.horometro;
  else if (horometro < intervalo * 2) desde = 0; // máquina nueva: el primer servicio toca a las 250 h
  else return { ...sinDato, resumen: "Falta registrar el último mantenimiento que se le dio." };

  const proximoEn = desde + intervalo;
  const faltan = r1(proximoEn - horometro);
  const avance = (horometro - desde) / intervalo;
  const nivel: NivelMant = faltan < 0 ? "vencido" : faltan <= AVISO_PROXIMO ? "proximo" : "al_dia";
  const resumen =
    faltan < 0
      ? `Ya le toca mantenimiento: se pasó por ${fmt(-faltan)} horas.`
      : faltan === 0
        ? "Le toca mantenimiento hoy."
        : faltan <= AVISO_PROXIMO
          ? `Ya viene el mantenimiento: faltan ${fmt(faltan)} horas.`
          : `Faltan ${fmt(faltan)} horas para su mantenimiento.`;
  return { nivel, ultimo, desdeHoras: desde, proximoEn, faltan, avance, resumen };
}

// Qué tan urgente es (para ordenar: lo vencido primero)
export const ordenNivel: Record<NivelMant, number> = { vencido: 0, proximo: 1, sin_dato: 2, al_dia: 3 };
