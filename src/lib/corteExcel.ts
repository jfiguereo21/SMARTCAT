// Excel del corte para enviar al cliente: resumen por máquina y detalle de las horas de cada día.

import type { Corte, PagoDueno } from "./corte";

export type DetalleDia = { fecha: string; maquina: string; horas: number; tarifa: number; moneda: string; importe: number };

const FMT = "#,##0.00";

export async function construirExcelCorte(opts: {
  etiqueta: string;
  corte: Corte;
  detalle: DetalleDia[];
  duenos?: PagoDueno[];
}): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const { corte } = opts;

  const res = wb.addWorksheet("Resumen");
  res.columns = [
    { header: "Cliente", width: 26 },
    { header: "Máquina", width: 26 },
    { header: "Obra", width: 22 },
    { header: "Moneda", width: 9 },
    { header: "Tarifa por hora", width: 15 },
    { header: "Horas", width: 10 },
    { header: "Facturado", width: 16 },
    { header: "Galones del cliente", width: 18 },
    { header: "Descuento combustible", width: 20 },
    { header: "Total a cobrar", width: 16 },
  ];
  res.getRow(1).font = { bold: true };
  res.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
  for (const g of corte.grupos) {
    for (const l of g.lineas) {
      const r = res.addRow([
        g.cliente,
        l.maquina,
        l.obra ?? "",
        l.moneda,
        l.tarifa,
        l.horas,
        l.bruto,
        l.galonesCliente,
        l.descuento ?? "falta precio del día 25",
        l.neto ?? "",
      ]);
      for (const c of [5, 7, 9, 10]) r.getCell(c).numFmt = FMT;
      r.getCell(6).numFmt = FMT;
      r.getCell(8).numFmt = FMT;
    }
    for (const t of g.totales) {
      const r = res.addRow([`TOTAL ${g.cliente}`, "", "", t.moneda, "", "", t.bruto, "", t.descuento, t.neto]);
      r.font = { bold: true };
      for (const c of [7, 9, 10]) r.getCell(c).numFmt = FMT;
    }
    res.addRow([]);
  }
  res.addRow([`Corte: ${opts.etiqueta}`]).font = { italic: true };

  const det = wb.addWorksheet("Detalle de horas");
  det.columns = [
    { header: "Fecha", width: 12 },
    { header: "Máquina", width: 26 },
    { header: "Horas", width: 10 },
    { header: "Tarifa", width: 12 },
    { header: "Moneda", width: 9 },
    { header: "Importe", width: 16 },
  ];
  det.getRow(1).font = { bold: true };
  det.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
  for (const d of opts.detalle) {
    const r = det.addRow([d.fecha, d.maquina, d.horas, d.tarifa, d.moneda, d.importe]);
    r.getCell(3).numFmt = FMT;
    r.getCell(4).numFmt = FMT;
    r.getCell(6).numFmt = FMT;
  }
  det.views = [{ state: "frozen", ySplit: 1 }];

  if (opts.duenos && opts.duenos.length > 0) {
    const pd = wb.addWorksheet("Pago a dueños");
    pd.columns = [
      { header: "Máquina", width: 26 },
      { header: "Dueño", width: 18 },
      { header: "Pago por hora (RD$)", width: 18 },
      { header: "Horas", width: 10 },
      { header: "Bruto (RD$)", width: 16 },
      { header: "Galones cliente", width: 15 },
      { header: "Galones propios", width: 15 },
      { header: "Descuento combustible (RD$)", width: 24 },
      { header: "Pago neto (RD$)", width: 16 },
    ];
    pd.getRow(1).font = { bold: true };
    pd.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
    for (const d of opts.duenos) {
      const r = pd.addRow([
        d.maquina,
        d.dueno ?? "",
        d.pagoHora,
        d.horas,
        d.bruto,
        d.galonesCliente,
        d.galonesPropios,
        d.descuentaCombustible ? (d.descuento ?? "falta precio") : 0,
        d.neto ?? "",
      ]);
      for (const c of [3, 4, 5, 6, 7, 8, 9]) r.getCell(c).numFmt = FMT;
    }
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

