// Excel del cierre de cuenta de un socio. Se arma en el navegador y se guarda en la carpeta privada "cierres".

export type FilaCierre = {
  fecha: string;
  categoria: string;
  maquina: string;
  descripcion: string;
  monto: number;
  registradoPor: string;
  aprobadoPor: string;
  pagadoEl: string;
  comprobante: string;
};

export type DatosCierre = {
  socio: string;
  fechaCierre: string;
  cerradoPor: string;
  nota: string;
  gastos: FilaCierre[];
  devoluciones: FilaCierre[];
};

const FMT = "#,##0.00";
const COLS = [
  { header: "Fecha", key: "fecha", width: 12 },
  { header: "Categoría", key: "categoria", width: 26 },
  { header: "Máquina", key: "maquina", width: 20 },
  { header: "Descripción", key: "descripcion", width: 34 },
  { header: "Monto (RD$)", key: "monto", width: 16 },
  { header: "Registrado por", key: "registradoPor", width: 16 },
  { header: "Aprobado por", key: "aprobadoPor", width: 16 },
  { header: "Pagado el", key: "pagadoEl", width: 12 },
  { header: "Comprobante (archivo guardado)", key: "comprobante", width: 48 },
];

export async function construirExcel(d: DatosCierre): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const totalGastos = Math.round(d.gastos.reduce((t, f) => t + f.monto, 0) * 100) / 100;
  const totalDevuelto = Math.round(d.devoluciones.reduce((t, f) => t + f.monto, 0) * 100) / 100;

  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 34 }, { width: 40 }];
  res.addRow([`Cierre de cuenta de gastos: ${d.socio}`]).font = { bold: true, size: 14 };
  res.addRow([]);
  res.addRow(["Socio", d.socio]);
  res.addRow(["Fecha del cierre", d.fechaCierre]);
  res.addRow(["Cerrado por", d.cerradoPor]);
  res.addRow(["Cantidad de movimientos", d.gastos.length + d.devoluciones.length]);
  const rg = res.addRow(["Total de gastos pagados por el socio (RD$)", totalGastos]);
  const rd = res.addRow(["Total devuelto por el fondo (RD$)", totalDevuelto]);
  const rf = res.addRow(["Diferencia (RD$)", Math.round((totalGastos - totalDevuelto) * 100) / 100]);
  for (const r of [rg, rd, rf]) r.getCell(2).numFmt = FMT;
  rf.font = { bold: true };
  if (d.nota) res.addRow(["Nota", d.nota]);
  res.addRow([]);
  res.addRow(["Los comprobantes (fotos) siguen guardados en SmartCat; aquí aparece el nombre de cada archivo."]).font = {
    italic: true,
  };

  const hoja = (nombre: string, filas: FilaCierre[], total: number) => {
    const ws = wb.addWorksheet(nombre);
    ws.columns = COLS;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF4" } };
    for (const f of filas) ws.addRow(f).getCell("monto").numFmt = FMT;
    const fin = filas.length + 1;
    const t = ws.addRow({ descripcion: "TOTAL", monto: { formula: `SUM(E2:E${fin})`, result: total } });
    t.font = { bold: true };
    t.getCell("monto").numFmt = FMT;
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  hoja("Gastos del socio", d.gastos, totalGastos);
  hoja("Devoluciones", d.devoluciones, totalDevuelto);

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}
