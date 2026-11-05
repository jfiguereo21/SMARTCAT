export type FuelLog = {
  id: string;
  fecha: string; // AAAA-MM-DD
  machine_id: string;
  galones: number;
  nota: string | null;
  machines?: { nombre: string } | null;
};

export type PreciosCorte = {
  corte: string; // fecha del día 25 que cierra el corte
  precio_diesel_dop: number;
  tasa_dolar: number;
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

// Precio del galón en dólares: precio en pesos entre la tasa del dólar.
export function dieselUsd(precioDop: number, tasaDolar: number): number {
  return precioDop / tasaDolar;
}

export type ResumenCombustible = {
  horas: number;
  galones: number;
  combustibleUsd: number; // todo el combustible del corte en dólares
  porHora: number; // combustible entre horas
  tarifaNeta: number; // tarifa base menos combustible por hora, a 2 decimales
  monto: number; // horas × tarifa neta
};

// Así lo calcula el cliente: suma el combustible que consumió la máquina,
// lo divide entre las horas y ese resultado se le resta a la tarifa por hora.
// Si no hay horas no hay tarifa neta que calcular.
export function resumenCombustible(
  horas: number,
  galones: number,
  precioGalonUsd: number,
  tarifa: number
): ResumenCombustible | null {
  if (!(horas > 0)) return null;
  const combustibleUsd = galones * precioGalonUsd;
  const porHora = combustibleUsd / horas;
  const tarifaNeta = redondear2(tarifa - porHora);
  return {
    horas,
    galones,
    combustibleUsd: redondear2(combustibleUsd),
    porHora: redondear2(porHora),
    tarifaNeta,
    monto: redondear2(horas * tarifaNeta),
  };
}
