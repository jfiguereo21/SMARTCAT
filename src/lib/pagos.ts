// Reglas de pago a los operadores. Todo el dinero va en pesos (RD$).
//
// Día normal (lunes a sábado) con conduce: mínimo 8 horas (cada operador puede tener otro mínimo, p. ej. sábado 4); si trabajó más, se pagan horas completas hacia arriba,
// con 15 minutos de margen: 8 h 15 min = 8 h; 8 h 16 min = 9 h; 9 h 30 min = 10 h.
// Día normal sin conduce ni reporte: no se paga (el operador reporta alojamiento o reparación).
// Domingo o festivo: no se paga, salvo que pidan la máquina; entonces se paga el doble de las horas del conduce
// (sin mínimo y sin redondear a horas completas).
// El administrador puede reemplazar las horas de cualquier día (falta, taller, vacaciones...).

export const MIN_HORAS_DIA = 8;
export const HORAS_SIN_CONDUCE = 0; // sin conduce ni reporte no se paga: el operador tiene que reportar el día
export const FACTOR_DOBLE = 2;

export const redondear2 = (n: number) => Math.round(n * 100) / 100;

export const MARGEN_REDONDEO_HORAS = 0.25; // 15 minutos

// Horas que se pagan en un día normal con conduce: mínimo 8 y horas completas hacia arriba.
// Hasta 15 minutos pasada la hora completa no cuentan; si pasa de 15 minutos, se paga la hora siguiente.
export function horasPagablesDiaNormal(horas: number, minimo: number = MIN_HORAS_DIA): number {
  const r = redondear2(horas);
  const piso = Math.floor(r);
  const fraccion = redondear2(r - piso);
  const completas = fraccion <= MARGEN_REDONDEO_HORAS ? piso : piso + 1;
  return Math.max(minimo, completas);
}

// --- Fechas AAAA-MM-DD sin zonas horarias ---

function partes(f: string): [number, number, number] {
  const [y, m, d] = f.split("-").map(Number);
  return [y, m, d];
}
const pad = (n: number) => String(n).padStart(2, "0");
export const aFecha = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function diasDelMes(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function sumarDias(f: string, n: number): string {
  const [y, m, d] = partes(f);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return aFecha(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// 0 = domingo ... 6 = sábado
export function diaSemana(f: string): number {
  const [y, m, d] = partes(f);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const NOMBRES_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const nombreDia = (f: string) => NOMBRES_DIA[diaSemana(f)];

export function listaDias(inicio: string, fin: string): string[] {
  const dias: string[] = [];
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) dias.push(f);
  return dias;
}

// --- Quincenas ---
// Se pagan el 15 y el 30. El pago del 15 es lo producido del 30 del mes anterior al 14.
// El pago del 30 es lo producido del 15 al 29. En febrero el pago es el último día del mes.

export type Quincena = {
  inicio: string;
  fin: string;
  fechaPago: string;
  etiqueta: string;
};

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtCorta(f: string): string {
  const [, m, d] = partes(f);
  return `${d} ${MESES[m - 1]}`;
}

function armarQuincena(inicio: string, fin: string, fechaPago: string): Quincena {
  return { inicio, fin, fechaPago, etiqueta: `${fmtCorta(inicio)} al ${fmtCorta(fin)} · se paga el ${fmtCorta(fechaPago)}` };
}

export function quincenaDe(f: string): Quincena {
  const [y, m, d] = partes(f);
  const ultimo = diasDelMes(y, m);
  if (d >= 15 && d <= 29) {
    // Segunda quincena: del 15 al 29 (en febrero, hasta el último día)
    return armarQuincena(aFecha(y, m, 15), aFecha(y, m, Math.min(29, ultimo)), aFecha(y, m, Math.min(30, ultimo)));
  }
  if (d >= 30) {
    // 30 y 31: cuentan para el pago del 15 del mes siguiente
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return armarQuincena(aFecha(y, m, 30), aFecha(ny, nm, 14), aFecha(ny, nm, 15));
  }
  // Del 1 al 14: empieza el 30 del mes anterior (si ese mes tiene día 30) o el día 1
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const inicio = diasDelMes(py, pm) >= 30 ? aFecha(py, pm, 30) : aFecha(y, m, 1);
  return armarQuincena(inicio, aFecha(y, m, 14), aFecha(y, m, 15));
}

export function quincenaAnterior(q: Quincena): Quincena {
  return quincenaDe(sumarDias(q.inicio, -1));
}

export function quincenaSiguiente(q: Quincena): Quincena {
  return quincenaDe(sumarDias(q.fin, 1));
}

// --- Semana de dieta y combustible: se paga cada lunes lo de la semana anterior (lunes a domingo) ---

export type Semana = { inicio: string; fin: string; fechaPago: string; etiqueta: string };

export function semanaPagadaEl(lunes: string): Semana {
  const inicio = sumarDias(lunes, -7);
  const fin = sumarDias(lunes, -1);
  return { inicio, fin, fechaPago: lunes, etiqueta: `Semana del ${fmtCorta(inicio)} al ${fmtCorta(fin)} · se paga el lunes ${fmtCorta(lunes)}` };
}

// El lunes más reciente (o el mismo día si hoy es lunes).
export function ultimoLunes(hoy: string): string {
  const dow = diaSemana(hoy);
  return sumarDias(hoy, -((dow + 6) % 7));
}

// --- Horas a pagar por día ---

export type TipoDia =
  | "normal" // lunes a sábado con conduce
  | "sin_conduce" // lunes a sábado sin conduce ni reporte: no se paga
  | "doble" // domingo o festivo con conduce: el doble
  | "no_paga" // domingo o festivo sin conduce
  | "ajuste" // el administrador cambió las horas
  | "pendiente"; // solo hay conduces sin aprobar: no se cuenta todavía

export type DiaPago = {
  fueAlCampo: boolean; // cobra dieta y combustible ese día
  fecha: string;
  tipo: TipoDia;
  horasConduce: number; // horas aprobadas en conduces ese día
  horasPendientes: number; // horas en conduces sin aprobar
  horasPagadas: number;
  feriado: string | null; // nombre del festivo, si lo es
  nota: string | null;
  tarifa: number | null; // precio por hora que regía ese día
  minimo?: number; // mínimo de horas que regía ese día (solo días normales con conduce)
  dieta: number; // dieta de ese día (se cobra si fueAlCampo)
  combustible: number; // combustible de ese día (se cobra si fueAlCampo)
};

export type ConduceDia = { fecha: string; horas: number; aprobado: boolean };
export type AjusteDia = { horas: number; motivo: string | null; fueAlCampo?: boolean; porAprobar?: boolean };

// Lo que se pactó con cada operador. El perfil trae el trato inicial; los cambios se guardan con la fecha desde la que rigen.
export type Trato = Partial<
  Pick<
    PerfilPago,
    | "tarifa_hora"
    | "dieta_diaria"
    | "combustible_diario"
    | "combustible_por"
    | "horas_sin_conduce"
    | "minimo_horas_dia"
    | "minimo_horas_sabado"
    | "horas_alojamiento"
    | "dieta_siempre"
  >
>;

// El trato de un día concreto. El combustible va siempre por día (si se paga por semana, se divide entre 7).
export type TratoDia = {
  tarifa_hora: number | null;
  dieta_diaria: number;
  combustible_diario: number;
  minimo_horas_dia: number;
  minimo_horas_sabado: number;
  horas_alojamiento: number;
  horas_sin_conduce: number;
  dieta_alojamiento: boolean;
};

export type TratoRow = {
  id: string;
  user_id: string;
  desde: string;
  tarifa_hora: number | null;
  dieta_diaria: number;
  combustible_monto: number;
  combustible_por: "dia" | "semana";
  minimo_horas_dia: number;
  minimo_horas_sabado: number;
  horas_alojamiento: number;
  horas_sin_conduce: number;
  dieta_alojamiento: boolean;
  nota: string | null;
};

export const combustiblePorDia = (monto: number, por: "dia" | "semana") => (por === "semana" ? monto / 7 : monto);

export const aTratoRow = (x: Record<string, unknown>): TratoRow => ({
  id: String(x.id),
  user_id: String(x.user_id),
  desde: String(x.desde),
  tarifa_hora: x.tarifa_hora == null ? null : Number(x.tarifa_hora),
  dieta_diaria: Number(x.dieta_diaria ?? 0),
  combustible_monto: Number(x.combustible_monto ?? 0),
  combustible_por: (x.combustible_por as "dia" | "semana") ?? "dia",
  minimo_horas_dia: Number(x.minimo_horas_dia ?? MIN_HORAS_DIA),
  minimo_horas_sabado: Number(x.minimo_horas_sabado ?? MIN_HORAS_DIA),
  horas_alojamiento: Number(x.horas_alojamiento ?? 4),
  horas_sin_conduce: Number(x.horas_sin_conduce ?? HORAS_SIN_CONDUCE),
  dieta_alojamiento: Boolean(x.dieta_alojamiento),
  nota: (x.nota as string | null) ?? null,
});

export function tratoBase(t: Trato): TratoDia {
  return {
    tarifa_hora: t.tarifa_hora ?? null,
    dieta_diaria: t.dieta_diaria ?? 0,
    combustible_diario: combustiblePorDia(t.combustible_diario ?? 0, t.combustible_por ?? "dia"),
    minimo_horas_dia: t.minimo_horas_dia ?? MIN_HORAS_DIA,
    minimo_horas_sabado: t.minimo_horas_sabado ?? MIN_HORAS_DIA,
    horas_alojamiento: t.horas_alojamiento ?? 4,
    horas_sin_conduce: t.horas_sin_conduce ?? HORAS_SIN_CONDUCE,
    dieta_alojamiento: !!t.dieta_siempre,
  };
}

// El trato que rige en una fecha: el último cambio que empezó ese día o antes; si no hay, el trato inicial del perfil.
export function tratoVigente(base: Trato, tratos: TratoRow[] | undefined, fecha: string): TratoDia {
  let r: TratoRow | null = null;
  for (const x of tratos ?? []) if (x.desde <= fecha && (r == null || x.desde > r.desde)) r = x;
  if (!r) return tratoBase(base);
  return {
    tarifa_hora: r.tarifa_hora,
    dieta_diaria: r.dieta_diaria,
    combustible_diario: combustiblePorDia(r.combustible_monto, r.combustible_por),
    minimo_horas_dia: r.minimo_horas_dia,
    minimo_horas_sabado: r.minimo_horas_sabado,
    horas_alojamiento: r.horas_alojamiento,
    horas_sin_conduce: r.horas_sin_conduce,
    dieta_alojamiento: r.dieta_alojamiento,
  };
}

export type EntradaDias = {
  inicio: string;
  fin: string;
  pagaDesde: string | null; // antes de esta fecha no se paga nada
  hoy: string; // los días que no han terminado no cuentan
  conduces: ConduceDia[];
  feriados: Record<string, string>; // fecha -> nombre
  ajustes: Record<string, AjusteDia>; // fecha -> ajuste
  trato?: Trato; // trato inicial del operador (su perfil)
  tratos?: TratoRow[]; // cambios de trato con su fecha
};

export function calcularDias(e: EntradaDias): DiaPago[] {
  const desde = e.pagaDesde && e.pagaDesde > e.inicio ? e.pagaDesde : e.inicio;
  const hasta = e.fin < e.hoy ? e.fin : e.hoy;
  const dias: DiaPago[] = [];
  if (!e.pagaDesde) return dias; // sin fecha de inicio no se calcula nada
  for (const fecha of listaDias(desde, hasta)) {
    const aprobadas = redondear2(e.conduces.filter((c) => c.fecha === fecha && c.aprobado).reduce((a, c) => a + c.horas, 0));
    const pendientes = redondear2(e.conduces.filter((c) => c.fecha === fecha && !c.aprobado).reduce((a, c) => a + c.horas, 0));
    const feriado = e.feriados[fecha] ?? null;
    const ajuste = e.ajustes[fecha];
    const t = tratoVigente(e.trato ?? {}, e.tratos, fecha);
    const base = {
      fecha,
      horasConduce: aprobadas,
      horasPendientes: pendientes,
      feriado,
      tarifa: t.tarifa_hora,
      dieta: t.dieta_diaria,
      combustible: t.combustible_diario,
    };

    if (ajuste?.porAprobar) {
      // Reporte del operador sin aprobar: no se cuenta todavía
      dias.push({ ...base, tipo: "pendiente", horasPagadas: 0, nota: ajuste.motivo, fueAlCampo: false });
      continue;
    }
    if (ajuste) {
      dias.push({
        ...base,
        tipo: "ajuste",
        horasPagadas: redondear2(ajuste.horas),
        nota: ajuste.motivo,
        fueAlCampo: ajuste.fueAlCampo ?? false,
      });
      continue;
    }
    const noLaboral = diaSemana(fecha) === 0 || feriado != null;
    if (aprobadas > 0) {
      dias.push(
        noLaboral
          ? { ...base, tipo: "doble", horasPagadas: redondear2(aprobadas * FACTOR_DOBLE), nota: null, fueAlCampo: true }
          : {
              ...base,
              tipo: "normal",
              minimo: diaSemana(fecha) === 6 ? t.minimo_horas_sabado : t.minimo_horas_dia,
              horasPagadas: horasPagablesDiaNormal(
                aprobadas,
                diaSemana(fecha) === 6 ? t.minimo_horas_sabado : t.minimo_horas_dia
              ),
              nota: null,
              fueAlCampo: true,
            }
      );
    } else if (pendientes > 0) {
      dias.push({ ...base, tipo: "pendiente", horasPagadas: 0, nota: null, fueAlCampo: false });
    } else if (noLaboral) {
      dias.push({ ...base, tipo: "no_paga", horasPagadas: 0, nota: null, fueAlCampo: false });
    } else if (fecha < e.hoy) {
      // El día de hoy sin conduce todavía no cuenta: el operador reporta al final del día.
      dias.push({ ...base, tipo: "sin_conduce", horasPagadas: t.horas_sin_conduce, nota: null, fueAlCampo: false });
    }
  }
  return dias;
}

export type TotalPago = { horas: number; bruto: number; pendientes: number };

export function totalizar(dias: DiaPago[], tarifa: number | null): TotalPago {
  const horas = redondear2(dias.reduce((a, d) => a + d.horasPagadas, 0));
  const pendientes = redondear2(dias.reduce((a, d) => a + (d.tipo === "pendiente" ? d.horasPendientes : 0), 0));
  const bruto = dias.reduce((a, d) => {
    const t = d.tarifa ?? tarifa;
    return a + (t == null ? 0 : d.horasPagadas * t);
  }, 0);
  return { horas, bruto: redondear2(bruto), pendientes };
}

// --- Deudas ---

export type Deuda = {
  id: string;
  concepto: string;
  monto: number;
  fecha: string;
  descuento_por_pago: number | null;
};

export type DescuentoDeuda = { deuda_id: string; monto: number };

export function saldoDeuda(d: Pick<Deuda, "id" | "monto">, descuentos: DescuentoDeuda[]): number {
  const pagado = descuentos.filter((x) => x.deuda_id === d.id).reduce((a, x) => a + x.monto, 0);
  return redondear2(Math.max(0, d.monto - pagado));
}

export type LineaDescuento = { deuda: Deuda; saldo: number; descuento: number };

// Cuánto se descontaría de cada deuda en este pago: la cuota acordada (o todo el saldo si no hay cuota),
// la más vieja primero, sin pasar del saldo ni de lo que se le va a pagar.
export function planDescuentos(deudas: Deuda[], descuentos: DescuentoDeuda[], disponible: number): LineaDescuento[] {
  let restante = Math.max(0, redondear2(disponible));
  return [...deudas]
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
    .map((deuda) => {
      const saldo = saldoDeuda(deuda, descuentos);
      const cuota = deuda.descuento_por_pago ?? saldo;
      const descuento = redondear2(Math.max(0, Math.min(cuota, saldo, restante)));
      restante = redondear2(restante - descuento);
      return { deuda, saldo, descuento };
    })
    .filter((l) => l.saldo > 0);
}

// --- Filas de la base de datos (los números se convierten con Number al cargarlas) ---

export type PerfilPago = {
  user_id: string;
  nombre: string | null;
  activo: boolean;
  tarifa_hora: number | null;
  paga_desde: string | null;
  dieta_diaria: number;
  combustible_diario: number; // monto del combustible (por día o por semana, según combustible_por)
  combustible_por: "dia" | "semana";
  horas_alojamiento: number; // horas que se pagan el día que reporta "estuve en el alojamiento"
  horas_sin_conduce: number; // horas de un día de lunes a sábado sin conduce ni reporte (0: si no reporta, no se paga)
  minimo_horas_dia: number; // mínimo de horas de lunes a viernes con conduce
  minimo_horas_sabado: number; // mínimo de horas del sábado con conduce
  dieta_siempre: boolean; // el día "estuve en el alojamiento" también cobra dieta y combustible
};

export type AjusteRow = { user_id: string; fecha: string; horas: number; motivo: string | null; fue_al_campo: boolean };

// Lo que el operador reporta cuando no hay conduce: estuvo en el alojamiento o trabajó reparando la máquina.
export type TipoReporteDia = "alojamiento" | "reparacion";
export const ETIQUETA_REPORTE: Record<TipoReporteDia, string> = {
  alojamiento: "Estuve en el alojamiento (la máquina no trabajó)",
  reparacion: "Trabajé reparando la máquina",
};
export type ReporteDiaRow = {
  id: string;
  user_id: string;
  fecha: string;
  tipo: TipoReporteDia;
  nota: string | null;
  estado: "Pendiente" | "Aprobado" | "Rechazado";
  horas: number | null;
  fue_al_campo: boolean;
  motivo_rechazo: string | null;
};
export const aReporteDiaRow = (x: Record<string, unknown>): ReporteDiaRow => ({
  id: String(x.id),
  user_id: String(x.user_id),
  fecha: String(x.fecha),
  tipo: x.tipo as TipoReporteDia,
  nota: (x.nota as string | null) ?? null,
  estado: x.estado as ReporteDiaRow["estado"],
  horas: x.horas == null ? null : Number(x.horas),
  fue_al_campo: Boolean(x.fue_al_campo),
  motivo_rechazo: (x.motivo_rechazo as string | null) ?? null,
});

// Mapa fecha -> ajuste para calcularDias: los ajustes del administrador mandan; después los reportes del
// operador (aprobados cuentan con las horas que se aprobaron, pendientes quedan por aprobar, rechazados no cuentan).
export function mapaAjustes(ajustes: AjusteRow[], reportes: ReporteDiaRow[] = []): Record<string, AjusteDia> {
  const m: Record<string, AjusteDia> = {};
  for (const r of reportes) {
    if (r.estado === "Rechazado") continue;
    m[r.fecha] =
      r.estado === "Aprobado"
        ? { horas: r.horas ?? 0, motivo: ETIQUETA_REPORTE[r.tipo], fueAlCampo: r.fue_al_campo }
        : { horas: 0, motivo: ETIQUETA_REPORTE[r.tipo], fueAlCampo: false, porAprobar: true };
  }
  for (const a of ajustes) m[a.fecha] = { horas: a.horas, motivo: a.motivo, fueAlCampo: a.fue_al_campo };
  return m;
}

export type PagoRow = {
  id: string;
  user_id: string;
  tipo: "quincena" | "semanal";
  periodo_inicio: string;
  periodo_fin: string;
  fecha_pago: string;
  horas: number;
  tarifa_hora: number | null;
  bruto: number;
  dieta: number;
  combustible: number;
  descuento_deudas: number;
  neto: number;
  nota: string | null;
  voucher_path: string | null; // foto del voucher que sube el administrador
};

export type DescuentoRow = {
  id: string;
  deuda_id: string;
  user_id: string;
  pago_id: string | null;
  monto: number;
  fecha: string;
  nota: string | null;
};

export type DeudaRow = Deuda & { user_id: string; nota: string | null };

export const aPerfilPago = (x: Record<string, unknown>): PerfilPago => ({
  user_id: String(x.user_id),
  nombre: (x.nombre as string | null) ?? null,
  activo: Boolean(x.activo),
  tarifa_hora: x.tarifa_hora == null ? null : Number(x.tarifa_hora),
  paga_desde: (x.paga_desde as string | null) ?? null,
  dieta_diaria: Number(x.dieta_diaria ?? 0),
  combustible_diario: Number(x.combustible_diario ?? 0),
  combustible_por: (x.combustible_por as "dia" | "semana") ?? "dia",
  horas_alojamiento: Number(x.horas_alojamiento ?? 4),
  horas_sin_conduce: Number(x.horas_sin_conduce ?? HORAS_SIN_CONDUCE),
  minimo_horas_dia: Number(x.minimo_horas_dia ?? MIN_HORAS_DIA),
  minimo_horas_sabado: Number(x.minimo_horas_sabado ?? MIN_HORAS_DIA),
  dieta_siempre: Boolean(x.dieta_siempre),
});

export const aPagoRow = (x: Record<string, unknown>): PagoRow => ({
  id: String(x.id),
  user_id: String(x.user_id),
  tipo: x.tipo as PagoRow["tipo"],
  periodo_inicio: String(x.periodo_inicio),
  periodo_fin: String(x.periodo_fin),
  fecha_pago: String(x.fecha_pago),
  horas: Number(x.horas),
  tarifa_hora: x.tarifa_hora == null ? null : Number(x.tarifa_hora),
  bruto: Number(x.bruto),
  dieta: Number(x.dieta),
  combustible: Number(x.combustible),
  descuento_deudas: Number(x.descuento_deudas),
  neto: Number(x.neto),
  nota: (x.nota as string | null) ?? null,
  voucher_path: (x.voucher_path as string | null) ?? null,
});

export const aDeudaRow = (x: Record<string, unknown>): DeudaRow => ({
  id: String(x.id),
  user_id: String(x.user_id),
  concepto: String(x.concepto),
  monto: Number(x.monto),
  fecha: String(x.fecha),
  descuento_por_pago: x.descuento_por_pago == null ? null : Number(x.descuento_por_pago),
  nota: (x.nota as string | null) ?? null,
});

export const aDescuentoRow = (x: Record<string, unknown>): DescuentoRow => ({
  id: String(x.id),
  deuda_id: String(x.deuda_id),
  user_id: String(x.user_id),
  pago_id: (x.pago_id as string | null) ?? null,
  monto: Number(x.monto),
  fecha: String(x.fecha),
  nota: (x.nota as string | null) ?? null,
});

export const aAjusteRow = (x: Record<string, unknown>): AjusteRow => ({
  user_id: String(x.user_id),
  fecha: String(x.fecha),
  horas: Number(x.horas),
  motivo: (x.motivo as string | null) ?? null,
  fue_al_campo: Boolean(x.fue_al_campo),
});

export const etiquetaTipo: Record<TipoDia, string> = {
  normal: "Trabajó",
  sin_conduce: "Sin conduce ni reporte",
  doble: "Con la máquina en domingo o festivo (doble)",
  no_paga: "No se paga",
  ajuste: "Ajustado",
  pendiente: "Por aprobar",
};

// Explicación de un día en palabras sencillas, para que el operador entienda qué se le paga y por qué.
const fmtH = (n: number) => `${String(redondear2(n)).replace(".", ",")} ${redondear2(n) === 1 ? "hora" : "horas"}`;

export function explicarDia(d: DiaPago): { titulo: string; detalle: string } {
  const dom = diaSemana(d.fecha) === 0;
  const especial = d.feriado ?? (dom ? "domingo" : "");
  switch (d.tipo) {
    case "normal": {
      const min = d.minimo ?? MIN_HORAS_DIA;
      if (d.horasConduce < min) {
        return {
          titulo: "Trabajaste con conduce",
          detalle: `En el conduce hay ${fmtH(d.horasConduce)}, pero el mínimo del día es ${fmtH(min)}. Se te pagan ${fmtH(d.horasPagadas)}.`,
        };
      }
      if (redondear2(d.horasConduce) === d.horasPagadas) {
        return { titulo: "Trabajaste con conduce", detalle: `En el conduce hay ${fmtH(d.horasConduce)}. Se te pagan ${fmtH(d.horasPagadas)}.` };
      }
      return {
        titulo: "Trabajaste con conduce",
        detalle: `En el conduce hay ${fmtH(d.horasConduce)}. Se redondea a horas completas (pasados 15 minutos cuenta la hora siguiente). Se te pagan ${fmtH(d.horasPagadas)}.`,
      };
    }
    case "doble":
      return {
        titulo: `Trabajaste en ${d.feriado ? `festivo (${d.feriado})` : "domingo"}`,
        detalle: `En el conduce hay ${fmtH(d.horasConduce)}. En ${d.feriado ? "festivo" : "domingo"} se paga el doble: ${fmtH(d.horasPagadas)}.`,
      };
    case "ajuste":
      return {
        titulo: d.nota ?? "Día aprobado por el administrador",
        detalle:
          d.horasPagadas > 0
            ? `El administrador aprobó ${fmtH(d.horasPagadas)} para este día.`
            : "El administrador puso este día sin pago.",
      };
    case "sin_conduce":
      return {
        titulo: "No hay conduce ni reporte",
        detalle: "Si estuviste en el alojamiento o reparando la máquina, tienes que reportar el día. Sin reporte no se paga.",
      };
    case "no_paga":
      return { titulo: `No se trabajó (${especial})`, detalle: "Los domingos y festivos sin trabajo no se pagan." };
    case "pendiente":
      return {
        titulo: "Esperando aprobación",
        detalle: "El administrador todavía no lo ha aprobado. Todavía no se cuenta; cuando lo apruebe se suma aquí.",
      };
  }
}

// --- Dieta y combustible: se pagan por cada día que el operador fue al campo, y se entregan cada lunes ---

export type TotalCampo = { dias: number; dieta: number; combustible: number };

export function totalCampo(dias: DiaPago[]): TotalCampo {
  const campo = dias.filter((d) => d.fueAlCampo);
  return {
    dias: campo.length,
    dieta: redondear2(campo.reduce((a, d) => a + d.dieta, 0)),
    combustible: redondear2(campo.reduce((a, d) => a + d.combustible, 0)),
  };
}

// --- Lo que el operador lleva sin cobrar hasta hoy (para su pantalla) ---

export type ResumenPendiente = {
  horas: number; // horas pagables acumuladas en las quincenas sin pagar
  ganado: number; // lo ganado por esas horas
  descuento: number; // lo que se le descontaría por deudas en esos pagos
  campo: TotalCampo; // dieta y combustible de las semanas sin pagar
  debe: number; // lo que debe en total ahora mismo
  total: number; // ganado + dieta y combustible - descuento
  horasPorAprobar: number;
  proximoPago: string | null; // fecha en que se paga la quincena más vieja sin pagar
};

export function resumenPendiente(e: {
  perfil: Pick<PerfilPago, "tarifa_hora" | "paga_desde" | "dieta_diaria" | "combustible_diario"> & Trato;
  tratos?: TratoRow[];
  hoy: string;
  conduces: ConduceDia[];
  feriados: Record<string, string>;
  ajustes: Record<string, AjusteDia>;
  deudas: Deuda[];
  descuentos: DescuentoDeuda[];
  pagos: Pick<PagoRow, "tipo" | "periodo_inicio" | "periodo_fin">[];
}): ResumenPendiente {
  const vacio: ResumenPendiente = {
    horas: 0,
    ganado: 0,
    descuento: 0,
    campo: { dias: 0, dieta: 0, combustible: 0 },
    debe: redondear2(e.deudas.reduce((a, d) => a + saldoDeuda(d, e.descuentos), 0)),
    total: 0,
    horasPorAprobar: 0,
    proximoPago: null,
  };
  if (!e.perfil.paga_desde) return vacio;

  const dias = calcularDias({
    inicio: e.perfil.paga_desde,
    fin: e.hoy,
    pagaDesde: e.perfil.paga_desde,
    hoy: e.hoy,
    conduces: e.conduces,
    feriados: e.feriados,
    ajustes: e.ajustes,
    trato: e.perfil,
    tratos: e.tratos,
  });

  // Quincenas sin pagar, de la más vieja a la más nueva
  const grupos = new Map<string, DiaPago[]>();
  for (const d of dias) {
    const q = quincenaDe(d.fecha);
    const k = `${q.inicio}|${q.fin}`;
    grupos.set(k, [...(grupos.get(k) ?? []), d]);
  }
  let horas = 0;
  let ganado = 0;
  let descuento = 0;
  let porAprobar = 0;
  let proximoPago: string | null = null;
  const corriendo: DescuentoDeuda[] = [...e.descuentos];
  for (const [k, ds] of [...grupos.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [inicio, fin] = k.split("|");
    porAprobar += totalizar(ds, e.perfil.tarifa_hora).pendientes;
    if (e.pagos.some((p) => p.tipo === "quincena" && p.periodo_inicio === inicio && p.periodo_fin === fin)) continue;
    const t = totalizar(ds, e.perfil.tarifa_hora);
    if (proximoPago == null) proximoPago = quincenaDe(inicio).fechaPago;
    horas += t.horas;
    ganado += t.bruto;
    const plan = planDescuentos(e.deudas, corriendo, t.bruto);
    for (const l of plan) {
      descuento += l.descuento;
      if (l.descuento > 0) corriendo.push({ deuda_id: l.deuda.id, monto: l.descuento });
    }
  }

  // Dieta y combustible de las semanas (lunes a domingo) que todavía no se han pagado
  const diasSinPagar = dias.filter(
    (d) => !e.pagos.some((p) => p.tipo === "semanal" && p.periodo_inicio === ultimoLunes(d.fecha))
  );
  const campo = totalCampo(diasSinPagar);

  horas = redondear2(horas);
  ganado = redondear2(ganado);
  descuento = redondear2(descuento);
  return {
    horas,
    ganado,
    descuento,
    campo,
    debe: vacio.debe,
    total: redondear2(ganado + campo.dieta + campo.combustible - descuento),
    horasPorAprobar: redondear2(porAprobar),
    proximoPago,
  };
}
