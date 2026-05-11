import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import * as PImage from "pureimage";
import { Resend } from "resend";
import { PassThrough } from "stream";

import { getReportRecipient, getResendApiKey, getResendFromEmail } from "@/lib/env";
import type { FuelRecord, FuelReportFilters } from "@/types/fuel";

const CHART_WIDTH = 1200;
const CHART_HEIGHT = 480;
const CHART_PADDING = 56;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}

function chunkRecords<T>(records: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < records.length; index += chunkSize) {
    chunks.push(records.slice(index, index + chunkSize));
  }

  return chunks;
}

function buildCostByVehicle(records: FuelRecord[]) {
  const map = new Map<string, number>();
  records.forEach((record) => {
    map.set(record.vehicle, (map.get(record.vehicle) ?? 0) + record.totalCost);
  });

  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);
}

function buildPriceHistory(records: FuelRecord[]) {
  const map = new Map<string, { total: number; count: number }>();

  records.forEach((record) => {
    const current = map.get(record.date) ?? { total: 0, count: 0 };
    current.total += record.pricePerLiter;
    current.count += 1;
    map.set(record.date, current);
  });

  return Array.from(map.entries())
    .map(([date, stats]) => ({ date, value: stats.total / stats.count }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

async function renderBarChart(records: FuelRecord[]) {
  const dataset = buildCostByVehicle(records).slice(0, 10);
  const image = PImage.make(CHART_WIDTH, CHART_HEIGHT);
  const context = image.getContext("2d");
  const maxValue = Math.max(...dataset.map((item) => item.value), 1);
  const chartWidth = CHART_WIDTH - CHART_PADDING * 2;
  const chartHeight = CHART_HEIGHT - CHART_PADDING * 2;
  const barWidth = chartWidth / Math.max(dataset.length, 1) - 16;

  context.fillStyle = "#020617";
  context.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  context.strokeStyle = "#1e293b";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(CHART_PADDING, CHART_PADDING);
  context.lineTo(CHART_PADDING, CHART_HEIGHT - CHART_PADDING);
  context.lineTo(CHART_WIDTH - CHART_PADDING, CHART_HEIGHT - CHART_PADDING);
  context.stroke();

  dataset.forEach((item, index) => {
    const height = (item.value / maxValue) * (chartHeight - 12);
    const x = CHART_PADDING + index * (barWidth + 16) + 8;
    const y = CHART_HEIGHT - CHART_PADDING - height;

    context.fillStyle = "#22c55e";
    context.fillRect(x, y, Math.max(barWidth, 18), height);
  });

  return encodePng(image);
}

async function renderLineChart(records: FuelRecord[]) {
  const dataset = buildPriceHistory(records);
  const image = PImage.make(CHART_WIDTH, CHART_HEIGHT);
  const context = image.getContext("2d");
  const maxValue = Math.max(...dataset.map((item) => item.value), 1);
  const minValue = Math.min(...dataset.map((item) => item.value), 0);
  const chartWidth = CHART_WIDTH - CHART_PADDING * 2;
  const chartHeight = CHART_HEIGHT - CHART_PADDING * 2;

  context.fillStyle = "#020617";
  context.fillRect(0, 0, CHART_WIDTH, CHART_HEIGHT);
  context.strokeStyle = "#1e293b";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(CHART_PADDING, CHART_PADDING);
  context.lineTo(CHART_PADDING, CHART_HEIGHT - CHART_PADDING);
  context.lineTo(CHART_WIDTH - CHART_PADDING, CHART_HEIGHT - CHART_PADDING);
  context.stroke();

  if (dataset.length) {
    context.strokeStyle = "#38bdf8";
    context.lineWidth = 4;
    context.beginPath();

    dataset.forEach((item, index) => {
      const x =
        CHART_PADDING +
        (index / Math.max(dataset.length - 1, 1)) * chartWidth;
      const normalized = (item.value - minValue) / Math.max(maxValue - minValue, 1);
      const y = CHART_HEIGHT - CHART_PADDING - normalized * (chartHeight - 12);

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.stroke();

    dataset.forEach((item, index) => {
      const x =
        CHART_PADDING +
        (index / Math.max(dataset.length - 1, 1)) * chartWidth;
      const normalized = (item.value - minValue) / Math.max(maxValue - minValue, 1);
      const y = CHART_HEIGHT - CHART_PADDING - normalized * (chartHeight - 12);

      context.fillStyle = "#38bdf8";
      context.beginPath();
      context.arc(x, y, 6, 0, Math.PI * 2);
      context.fill();
    });
  }

  return encodePng(image);
}

async function encodePng(image: PImage.Bitmap): Promise<Buffer> {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];

  stream.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  await PImage.encodePNGToStream(image, stream);

  return Buffer.concat(chunks);
}

function applyHeaderStyle(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFE2E8F0" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF1E293B" } },
    };
  });
}

export async function buildMonthlyReportWorkbook({
  records,
  reportMonth,
  periodStart,
  periodEnd,
}: {
  records: FuelRecord[];
  reportMonth: string;
  periodStart: string;
  periodEnd: string;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dashboard de Gestao de Combustivel";
  workbook.created = new Date();
  workbook.modified = new Date();

  const controlSheet = workbook.addWorksheet("Controle", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const dashboardSheet = workbook.addWorksheet("Dashboard");
  const supportSheet = workbook.addWorksheet("Apoio", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const totalCost = records.reduce((sum, item) => sum + item.totalCost, 0);
  const totalLiters = records.reduce((sum, item) => sum + item.quantity, 0);
  const averagePrice = totalLiters > 0 ? totalCost / totalLiters : 0;
  const averageAutonomy = records.length
    ? records.reduce((sum, item) => sum + item.autonomy, 0) / records.length
    : 0;

  controlSheet.columns = [
    { width: 28 },
    { width: 28 },
    { width: 22 },
    { width: 18 },
  ];

  controlSheet.mergeCells("A1:D1");
  controlSheet.getCell("A1").value = "Relatorio Mensal de Frota";
  controlSheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  controlSheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF020617" },
  };

  controlSheet.addRows([
    ["Mes de referencia", reportMonth],
    ["Periodo processado", `${periodStart} a ${periodEnd}`],
    ["Total de registros", records.length],
    ["Gasto total", totalCost],
    ["Volume total (L)", totalLiters],
    ["Preco medio do litro", averagePrice],
    ["Media de autonomia", averageAutonomy],
  ]);

  controlSheet.getColumn(2).numFmt = "0.00";
  controlSheet.getCell("B5").numFmt = '"R$"#,##0.00';
  controlSheet.getCell("B7").numFmt = "0.00";

  controlSheet.addRow([]);
  controlSheet.addRow(["Veiculo", "Placa", "Fornecedor", "Custo total"]);
  applyHeaderStyle(controlSheet.lastRow!);
  records.forEach((record) => {
    controlSheet.addRow([record.vehicle, record.licensePlate, record.supplier, record.totalCost]);
  });
  controlSheet.getColumn(4).numFmt = '"R$"#,##0.00';

  supportSheet.columns = [
    { header: "Data", key: "date", width: 14 },
    { header: "Veiculo", key: "vehicle", width: 28 },
    { header: "Placa", key: "licensePlate", width: 16 },
    { header: "Modelo", key: "model", width: 24 },
    { header: "Fornecedor", key: "supplier", width: 28 },
    { header: "Combustivel", key: "fuelType", width: 18 },
    { header: "Quantidade", key: "quantity", width: 14 },
    { header: "Preco litro", key: "pricePerLiter", width: 14 },
    { header: "Custo total", key: "totalCost", width: 16 },
    { header: "Medida", key: "odometer", width: 14 },
    { header: "Autonomia", key: "autonomy", width: 14 },
  ];
  applyHeaderStyle(supportSheet.getRow(1));
  records.forEach((record) => supportSheet.addRow(record));
  supportSheet.getColumn(8).numFmt = '"R$"#,##0.00';
  supportSheet.getColumn(9).numFmt = '"R$"#,##0.00';

  dashboardSheet.mergeCells("A1:H1");
  dashboardSheet.getCell("A1").value = `Dashboard ${reportMonth}`;
  dashboardSheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  dashboardSheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF020617" },
  };
  dashboardSheet.getCell("A3").value = "KPIs";
  dashboardSheet.getCell("A4").value = "Gasto total";
  dashboardSheet.getCell("B4").value = formatCurrency(totalCost);
  dashboardSheet.getCell("A5").value = "Media de consumo da frota";
  dashboardSheet.getCell("B5").value = formatNumber(averageAutonomy);
  dashboardSheet.getCell("A6").value = "Preco medio do litro";
  dashboardSheet.getCell("B6").value = formatCurrency(averagePrice);
  dashboardSheet.getCell("A8").value =
    "Os graficos abaixo sao renderizados programaticamente e inseridos no workbook no momento da geracao.";
  dashboardSheet.getCell("A8").font = { italic: true, color: { argb: "FF94A3B8" } };

  const barChartBuffer = await renderBarChart(records);
  const lineChartBuffer = await renderLineChart(records);
  const barChartBase64 = `data:image/png;base64,${barChartBuffer.toString("base64")}`;
  const lineChartBase64 = `data:image/png;base64,${lineChartBuffer.toString("base64")}`;
  const barChartId = workbook.addImage({
    base64: barChartBase64,
    extension: "png",
  });
  const lineChartId = workbook.addImage({
    base64: lineChartBase64,
    extension: "png",
  });

  dashboardSheet.addImage(barChartId, {
    tl: { col: 0, row: 9 },
    ext: { width: 700, height: 280 },
  });
  dashboardSheet.addImage(lineChartId, {
    tl: { col: 8, row: 9 },
    ext: { width: 700, height: 280 },
  });

  const fileName = `relatorio-frota-${reportMonth}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();

  return {
    fileName,
    buffer: Buffer.from(buffer),
  };
}

export async function sendMonthlyReportEmail({
  fileName,
  fileBuffer,
  reportMonth,
  rowCount,
}: {
  fileName: string;
  fileBuffer: Buffer;
  reportMonth: string;
  rowCount: number;
}) {
  const apiKey = getResendApiKey();
  const from = getResendFromEmail();
  const recipient = getReportRecipient();

  if (!apiKey || !from || !recipient) {
    throw new Error(
      "Variaveis RESEND_API_KEY, RESEND_FROM_EMAIL e REPORT_RECIPIENT_EMAIL devem estar configuradas.",
    );
  }

  const resend = new Resend(apiKey);

  await resend.emails.send({
    from,
    to: recipient,
    subject: `Relatorio mensal da frota - ${reportMonth}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a;">
        <h2>Relatorio mensal da frota</h2>
        <p>O relatorio referente a <strong>${reportMonth}</strong> foi gerado automaticamente.</p>
        <p>Total de linhas processadas: <strong>${rowCount}</strong>.</p>
      </div>
    `,
    attachments: [
      {
        filename: fileName,
        content: fileBuffer,
      },
    ],
  });

  return recipient;
}

export async function buildDetailedFuelPdfReport({
  records,
  filters,
}: {
  records: FuelRecord[];
  filters: FuelReportFilters;
}) {
  const document = new PDFDocument({
    size: "A4",
    margin: 40,
    bufferPages: true,
  });

  const chunks: Buffer[] = [];

  document.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });

  const totalCost = records.reduce((sum, record) => sum + record.totalCost, 0);
  const totalLiters = records.reduce((sum, record) => sum + record.quantity, 0);
  const averagePrice = totalLiters > 0 ? totalCost / totalLiters : 0;
  const divergentCount = records.filter((record) => record.priceValidationStatus === "DIVERGENTE").length;
  const validCount = records.filter((record) => record.priceValidationStatus === "CORRETO").length;
  const withoutRuleCount = records.filter((record) => record.priceValidationStatus === "SEM_PARAMETRO").length;
  const costBySupplier = Array.from(
    records.reduce((map, record) => {
      map.set(record.supplier, (map.get(record.supplier) ?? 0) + record.totalCost);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => right[1] - left[1]);
  const litersByVehicle = Array.from(
    records.reduce((map, record) => {
      map.set(record.vehicle, (map.get(record.vehicle) ?? 0) + record.quantity);
      return map;
    }, new Map<string, number>()),
  ).sort((left, right) => right[1] - left[1]);
  const topSuppliers: Array<[string, number]> = costBySupplier.length ? costBySupplier.slice(0, 10) : [["Sem dados", 0]];
  const topVehicles: Array<[string, number]> = litersByVehicle.length ? litersByVehicle.slice(0, 10) : [["Sem dados", 0]];

  document.font("Helvetica-Bold").fontSize(18).fillColor("#0f172a").text("Relatorio Detalhado de Abastecimentos");
  document.moveDown(0.5);
  document.font("Helvetica").fontSize(10).fillColor("#475569").text(`Gerado em ${new Date().toLocaleString("pt-BR")}`);
  document.moveDown(1);

  document.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Filtros aplicados");
  document.moveDown(0.4);
  document.font("Helvetica").fontSize(10).fillColor("#111827");
  document.text(`Placa / Veiculo: ${filters.vehicle && filters.vehicle !== "todos" ? filters.vehicle : "Todos"}`);
  document.text(`Posto: ${filters.supplier && filters.supplier !== "todos" ? filters.supplier : "Todos"}`);
  document.text(`Mes: ${filters.reportMonth || "Todos"}`);
  document.text(`Dia: ${filters.reportDay ? formatDate(filters.reportDay) : "Todos"}`);
  document.moveDown(1);

  document.font("Helvetica-Bold").fontSize(12).text("Resumo geral");
  document.moveDown(0.4);
  document.font("Helvetica").fontSize(10);
  document.text(`Total de registros: ${records.length}`);
  document.text(`Gasto total: ${formatCurrency(totalCost)}`);
  document.text(`Volume total: ${formatNumber(totalLiters)} L`);
  document.text(`Preco medio do litro: ${formatCurrency(averagePrice)}`);
  document.text(`Precos corretos: ${validCount}`);
  document.text(`Precos divergentes: ${divergentCount}`);
  document.text(`Sem parametro: ${withoutRuleCount}`);
  document.moveDown(1);

  document.font("Helvetica-Bold").fontSize(12).text("Top postos por gasto");
  document.moveDown(0.4);
  document.font("Helvetica").fontSize(10);
  topSuppliers.forEach(([supplier, value], index) => {
    document.text(`${index + 1}. ${supplier}: ${formatCurrency(value)}`);
  });
  document.moveDown(1);

  document.font("Helvetica-Bold").fontSize(12).text("Top veiculos por volume");
  document.moveDown(0.4);
  document.font("Helvetica").fontSize(10);
  topVehicles.forEach(([vehicle, value], index) => {
    document.text(`${index + 1}. ${vehicle}: ${formatNumber(value)} L`);
  });
  document.moveDown(1);

  const pages = chunkRecords(records, 18);

  pages.forEach((pageRecords, pageIndex) => {
    if (pageIndex > 0) {
      document.addPage();
    }

    document.font("Helvetica-Bold").fontSize(12).fillColor("#0f172a").text("Detalhamento dos abastecimentos");
    document.moveDown(0.5);
    document.font("Helvetica-Bold").fontSize(8);
    const headerY = document.y;
    document.text("Data", 40, headerY, { width: 48 });
    document.text("Veiculo", 90, headerY, { width: 84 });
    document.text("Posto", 176, headerY, { width: 78 });
    document.text("Comb.", 256, headerY, { width: 48 });
    document.text("Qtd", 306, headerY, { width: 34, align: "right" });
    document.text("Preco", 342, headerY, { width: 48, align: "right" });
    document.text("Esperado", 392, headerY, { width: 54, align: "right" });
    document.text("Status", 448, headerY, { width: 54, align: "right" });
    document.text("Total", 504, headerY, { width: 50, align: "right" });
    document.moveDown(0.4);
    document.moveTo(40, document.y).lineTo(554, document.y).strokeColor("#cbd5e1").stroke();
    document.moveDown(0.4);

    pageRecords.forEach((record) => {
      const y = document.y;
      document.font("Helvetica").fontSize(8).fillColor("#111827");
      document.text(formatDate(record.date), 40, y, { width: 48 });
      document.text(record.vehicle, 90, y, { width: 84, ellipsis: true });
      document.text(record.supplier, 176, y, { width: 78, ellipsis: true });
      document.text(record.fuelType, 256, y, { width: 48, ellipsis: true });
      document.text(formatNumber(record.quantity), 306, y, { width: 34, align: "right" });
      document.text(formatCurrency(record.pricePerLiter), 342, y, { width: 48, align: "right" });
      document.text(
        record.expectedPricePerLiter === null || record.expectedPricePerLiter === undefined
          ? "-"
          : formatCurrency(record.expectedPricePerLiter),
        392,
        y,
        { width: 54, align: "right" },
      );
      document.fillColor(
        record.priceValidationStatus === "DIVERGENTE"
          ? "#dc2626"
          : record.priceValidationStatus === "CORRETO"
            ? "#16a34a"
            : "#d97706",
      );
      document.text(
        record.priceValidationStatus === "DIVERGENTE"
          ? "Divergente"
          : record.priceValidationStatus === "CORRETO"
            ? "Correto"
            : "Sem param.",
        448,
        y,
        { width: 54, align: "right" },
      );
      document.fillColor("#111827");
      document.text(formatCurrency(record.totalCost), 504, y, { width: 50, align: "right" });
      document.moveDown(0.9);
    });
  });

  await new Promise<void>((resolve, reject) => {
    document.on("end", () => resolve());
    document.on("error", reject);
    document.end();
  });

  const fileSuffix =
    filters.reportDay ||
    filters.reportMonth ||
    (filters.vehicle && filters.vehicle !== "todos" ? filters.vehicle : "geral");

  return {
    fileName: `relatorio-combustivel-${String(fileSuffix).replace(/[\\/:*?"<>| ]+/g, "-")}.pdf`,
    buffer: Buffer.concat(chunks),
  };
}
