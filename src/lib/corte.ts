// Corte del día 25: lo que se le cobra a cada cliente por las horas aprobadas del 26 al 25.
// Horas × tarifa del acuerdo que regía cada día, menos el combustible que dio el cliente
// (galones × precio del galón del día 25; en dólares, pesos entre la tasa).

import { acuerdoVigente, type Acuerdo, type Machine, type Moneda } from "./machines";
import { corteDe } from "./conduces";
import { descuentoCliente, redondear2, type PreciosCorte } from "./combustible";

export type ConduceCorte = { machine_id: string; fecha: string; horas_cobrables: number; estado: string };
export type CargaCorte = {
  machine_id: string;
  fecha: string;
  galones: number;
  origen: string;
  estado: string;
  monto?: number | null; // lo que costó la carga, cuando se anotó el precio
  moneda?: Moneda;
};

export type LineaCorte = {
  acuerdoId: string;
  machineId: string;
  maquina: string;
  obra: string | null;
  moneda: Moneda;
  tarifa: number;
  horas: number;
  bruto: number;
  galonesCliente: number;
  descuento: number | null; // null = falta el precio del día 25
  neto: number | null;
};

export type TotalMoneda = { moneda: Moneda; bruto: number; descuento: number; neto: number; completo: boolean };

export type GrupoCliente = {
  clienteId: string | null;
  cliente: string;
  lineas: LineaCorte[];
  totales: TotalMoneda[];
};

export type Corte = {
  clave: string;
  grupos: GrupoCliente[];
  horasSinAcuerdo: { machineId: string; maquina: string; horas: number }[];
  galonesSinAcuerdo: number;
  pendientes: number; // conduces del corte que aún no se aprueban (no cuentan)
  faltaPrecio: boolean;
};

export function armarCorte(
  clave: string,
  maquinas: Pick<Machine, "id" | "nombre">[],
  conduces: ConduceCorte[],
  cargas: CargaCorte[],
  acuerdos: Acuerdo[],
  precios: PreciosCorte | null
): Corte {
  const nombreMaq = (id: string) => maquinas.find((m) => m.id === id)?.nombre ?? "Máquina";
  const delCorte = conduces.filter((c) => corteDe(c.fecha).clave === clave);
  const pendientes = delCorte.filter((c) => c.estado === "Pendiente").length;
  const horasOk = delCorte.filter((c) => c.estado === "Aprobado");
  const cargasOk = cargas.filter(
    (c) => corteDe(c.fecha).clave === clave && c.estado === "Aprobado" && c.origen === "Cliente"
  );

  const lineas = new Map<string, LineaCorte>();
  const linea = (a: Acuerdo): LineaCorte => {
    const k = a.id;
    let l = lineas.get(k);
    if (!l) {
      l = {
        acuerdoId: a.id,
        machineId: a.machine_id,
        maquina: nombreMaq(a.machine_id),
        obra: a.obra,
        moneda: a.moneda,
        tarifa: a.tarifa,
        horas: 0,
        bruto: 0,
        galonesCliente: 0,
        descuento: null,
        neto: null,
      };
      lineas.set(k, l);
    }
    return l;
  };

  const sinAcuerdo = new Map<string, number>();
  for (const c of horasOk) {
    const a = acuerdoVigente(acuerdos, c.machine_id, c.fecha);
    if (!a) sinAcuerdo.set(c.machine_id, (sinAcuerdo.get(c.machine_id) ?? 0) + c.horas_cobrables);
    else {
      const l = linea(a);
      l.horas += c.horas_cobrables;
      l.bruto += c.horas_cobrables * a.tarifa;
    }
  }

  // El combustible del cliente va al acuerdo vigente ese día; si no hay, al único acuerdo con horas de esa máquina.
  let galonesSinAcuerdo = 0;
  for (const g of cargasOk) {
    let a = acuerdoVigente(acuerdos, g.machine_id, g.fecha);
    if (!a) {
      const propios = [...lineas.values()].filter((l) => l.machineId === g.machine_id);
      if (propios.length === 1) a = acuerdos.find((x) => x.id === propios[0].acuerdoId) ?? null;
    }
    if (!a) galonesSinAcuerdo += g.galones;
    else linea(a).galonesCliente += g.galones;
  }

  const faltaPrecio = precios == null && [...lineas.values()].some((l) => l.galonesCliente > 0);
  for (const l of lineas.values()) {
    l.horas = redondear2(l.horas);
    l.bruto = redondear2(l.bruto);
    l.galonesCliente = redondear2(l.galonesCliente);
    if (l.galonesCliente <= 0) {
      l.descuento = 0;
      l.neto = l.bruto;
    } else if (precios) {
      l.descuento = descuentoCliente(l.galonesCliente, precios.precio_diesel_dop, precios.tasa_dolar, l.moneda);
      l.neto = redondear2(l.bruto - l.descuento);
    }
  }

  const grupos = new Map<string, GrupoCliente>();
  for (const l of lineas.values()) {
    const a = acuerdos.find((x) => x.id === l.acuerdoId)!;
    const clienteId = a.client_id;
    const k = clienteId ?? "sin";
    let g = grupos.get(k);
    if (!g) {
      g = { clienteId, cliente: a.clients?.nombre ?? "Sin cliente asignado", lineas: [], totales: [] };
      grupos.set(k, g);
    }
    g.lineas.push(l);
  }
  for (const g of grupos.values()) {
    g.lineas.sort((x, y) => x.maquina.localeCompare(y.maquina));
    for (const moneda of ["DOP", "USD"] as Moneda[]) {
      const ls = g.lineas.filter((l) => l.moneda === moneda);
      if (ls.length === 0) continue;
      const bruto = redondear2(ls.reduce((t, l) => t + l.bruto, 0));
      const descuento = redondear2(ls.reduce((t, l) => t + (l.descuento ?? 0), 0));
      const completo = ls.every((l) => l.neto != null);
      g.totales.push({ moneda, bruto, descuento, neto: redondear2(bruto - descuento), completo });
    }
  }

  return {
    clave,
    grupos: [...grupos.values()].sort((a, b) => a.cliente.localeCompare(b.cliente)),
    horasSinAcuerdo: [...sinAcuerdo.entries()].map(([machineId, horas]) => ({
      machineId,
      maquina: nombreMaq(machineId),
      horas: redondear2(horas),
    })),
    galonesSinAcuerdo: redondear2(galonesSinAcuerdo),
    pendientes,
    faltaPrecio,
  };
}

// --- Pago al dueño de una máquina subcontratada ---
// Horas aprobadas del corte × lo que se le paga por hora al dueño. Si la máquina está marcada,
// se le resta el combustible que le echaron: el del cliente al precio del día 25, el propio con su precio.

export type PagoDueno = {
  machineId: string;
  maquina: string;
  dueno: string | null;
  pagoHora: number;
  horas: number;
  bruto: number;
  descuentaCombustible: boolean;
  galonesCliente: number;
  galonesPropios: number;
  descuentoCliente: number | null; // null = falta el precio del día 25
  descuentoPropio: number | null; // null = hay cargas propias sin precio
  descuento: number | null;
  neto: number | null;
};

export function pagoDuenos(
  clave: string,
  maquinas: Pick<Machine, "id" | "nombre" | "propiedad" | "dueno" | "pago_dueno" | "descuenta_combustible_dueno">[],
  conduces: ConduceCorte[],
  cargas: CargaCorte[],
  precios: PreciosCorte | null
): PagoDueno[] {
  const out: PagoDueno[] = [];
  for (const m of maquinas) {
    if (m.propiedad !== "Subcontratada" || m.pago_dueno == null) continue;
    const horas = redondear2(
      conduces
        .filter((c) => c.machine_id === m.id && c.estado === "Aprobado" && corteDe(c.fecha).clave === clave)
        .reduce((t, c) => t + c.horas_cobrables, 0)
    );
    const ok = cargas.filter(
      (c) => c.machine_id === m.id && c.estado === "Aprobado" && corteDe(c.fecha).clave === clave
    );
    const galonesCliente = redondear2(ok.filter((c) => c.origen === "Cliente").reduce((t, c) => t + c.galones, 0));
    const propias = ok.filter((c) => c.origen !== "Cliente");
    const galonesPropios = redondear2(propias.reduce((t, c) => t + c.galones, 0));
    if (horas <= 0 && galonesCliente <= 0 && galonesPropios <= 0) continue;

    const bruto = redondear2(horas * m.pago_dueno);
    const desc = m.descuenta_combustible_dueno;

    let descuentoCliente: number | null = 0;
    let descuentoPropio: number | null = 0;
    if (desc) {
      if (galonesCliente > 0) {
        descuentoCliente = precios ? redondear2(galonesCliente * precios.precio_diesel_dop) : null;
      }
      if (propias.length > 0) {
        let t = 0;
        for (const c of propias) {
          if (c.monto == null) {
            descuentoPropio = null;
            break;
          }
          t += c.moneda === "USD" ? (precios ? c.monto * precios.tasa_dolar : NaN) : c.monto;
        }
        if (descuentoPropio !== null) descuentoPropio = Number.isNaN(t) ? null : redondear2(t);
      }
    }
    const completo = descuentoCliente != null && descuentoPropio != null;
    const descuento = completo ? redondear2((descuentoCliente ?? 0) + (descuentoPropio ?? 0)) : null;
    out.push({
      machineId: m.id,
      maquina: m.nombre,
      dueno: m.dueno,
      pagoHora: m.pago_dueno,
      horas,
      bruto,
      descuentaCombustible: desc,
      galonesCliente,
      galonesPropios,
      descuentoCliente,
      descuentoPropio,
      descuento,
      neto: descuento == null ? null : redondear2(bruto - descuento),
    });
  }
  return out.sort((a, b) => a.maquina.localeCompare(b.maquina));
}
