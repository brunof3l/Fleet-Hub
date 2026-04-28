import ExcelJS from "exceljs";
import * as PImage from "pureimage";
import { Resend } from "resend";
import { PassThrough } from "stream";

import { getReportRecipient, getResendApiKey, getResendFromEmail } from "@/lib/env";
import type { FuelRecord } from "@/types/fuel";

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
