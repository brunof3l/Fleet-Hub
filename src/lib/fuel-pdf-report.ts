import type PDFDocument from "pdfkit";

import type { FuelRecord, FuelReportFilters } from "@/types/fuel";

const PAGE_MARGIN = 34;
const HEADER_HEIGHT = 74;
const FOOTER_HEIGHT = 24;
const CARD_GAP = 12;
const TABLE_HEADER_HEIGHT = 24;
const TABLE_CELL_PADDING = 6;

const COLORS = {
  pageBackground: "#f8fafc",
  headerBackground: "#0f172a",
  headerAccent: "#22c55e",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  border: "#cbd5e1",
  cardBorder: "#dbe4ee",
  cardBackground: "#ffffff",
  rowAlternate: "#f8fafc",
  tableHeader: "#e2e8f0",
  success: "#166534",
  successSoft: "#dcfce7",
  warning: "#b45309",
  warningSoft: "#fef3c7",
  danger: "#b91c1c",
  dangerSoft: "#fee2e2",
};

type PdfDocument = InstanceType<typeof PDFDocument>;

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

function formatStatusLabel(record: FuelRecord): string {
  if (record.priceValidationStatus === "CORRETO") {
    return "Correto";
  }

  if (record.priceValidationStatus === "DIVERGENTE") {
    return "Divergente";
  }

  return "Sem parametro";
}

function getStatusColors(record: FuelRecord) {
  if (record.priceValidationStatus === "CORRETO") {
    return {
      text: COLORS.success,
      background: COLORS.successSoft,
    };
  }

  if (record.priceValidationStatus === "DIVERGENTE") {
    return {
      text: COLORS.danger,
      background: COLORS.dangerSoft,
    };
  }

  return {
    text: COLORS.warning,
    background: COLORS.warningSoft,
  };
}

function getFilterValue(value: string | undefined, fallback = "Todos"): string {
  if (!value || value === "todos") {
    return fallback;
  }

  return value;
}

function drawPageBackground(document: PdfDocument) {
  document.save();
  document.rect(0, 0, document.page.width, document.page.height).fill(COLORS.pageBackground);
  document.restore();
}

function drawHeader(
  document: PdfDocument,
  title: string,
  subtitle: string,
) {
  drawPageBackground(document);
  document.save();
  document.roundedRect(PAGE_MARGIN, PAGE_MARGIN, document.page.width - PAGE_MARGIN * 2, HEADER_HEIGHT, 18).fill(
    COLORS.headerBackground,
  );
  document
    .roundedRect(PAGE_MARGIN + 16, PAGE_MARGIN + 16, 6, HEADER_HEIGHT - 32, 3)
    .fill(COLORS.headerAccent);
  document
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(title, PAGE_MARGIN + 32, PAGE_MARGIN + 18, {
      width: document.page.width - PAGE_MARGIN * 2 - 120,
    });
  document
    .fillColor("#cbd5e1")
    .font("Helvetica")
    .fontSize(10)
    .text(subtitle, PAGE_MARGIN + 32, PAGE_MARGIN + 46, {
      width: document.page.width - PAGE_MARGIN * 2 - 120,
    });
  document.restore();
  document.y = PAGE_MARGIN + HEADER_HEIGHT + 18;
}

function drawSectionTitle(
  document: PdfDocument,
  title: string,
  description?: string,
) {
  document.fillColor(COLORS.textPrimary).font("Helvetica-Bold").fontSize(13).text(title);

  if (description) {
    document.moveDown(0.2);
    document.fillColor(COLORS.textSecondary).font("Helvetica").fontSize(9.5).text(description);
  }

  document.moveDown(0.8);
}

function drawInfoCard(
  document: PdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  value: string,
  subtitle: string,
) {
  document.save();
  document.roundedRect(x, y, width, height, 14).fillAndStroke(COLORS.cardBackground, COLORS.cardBorder);
  document
    .fillColor(COLORS.textMuted)
    .font("Helvetica")
    .fontSize(8)
    .text(title.toUpperCase(), x + 14, y + 12, { width: width - 28 });
  document
    .fillColor(COLORS.textPrimary)
    .font("Helvetica-Bold")
    .fontSize(16)
    .text(value, x + 14, y + 26, { width: width - 28 });
  document
    .fillColor(COLORS.textSecondary)
    .font("Helvetica")
    .fontSize(8.5)
    .text(subtitle, x + 14, y + height - 22, { width: width - 28 });
  document.restore();
}

function drawLabeledValueBox(
  document: PdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
) {
  document.save();
  document.roundedRect(x, y, width, height, 12).fillAndStroke(COLORS.cardBackground, COLORS.cardBorder);
  document
    .fillColor(COLORS.textMuted)
    .font("Helvetica")
    .fontSize(7.5)
    .text(label.toUpperCase(), x + 12, y + 10, { width: width - 24 });
  document
    .fillColor(COLORS.textPrimary)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(value, x + 12, y + 23, { width: width - 24, height: height - 28, ellipsis: true });
  document.restore();
}

function drawRankingBox(
  document: PdfDocument,
  x: number,
  y: number,
  width: number,
  title: string,
  rows: Array<[string, number]>,
  formatter: (value: number) => string,
) {
  const rowHeight = 24;
  const height = 56 + Math.max(rows.length, 1) * rowHeight;

  document.save();
  document.roundedRect(x, y, width, height, 16).fillAndStroke(COLORS.cardBackground, COLORS.cardBorder);
  document.fillColor(COLORS.textPrimary).font("Helvetica-Bold").fontSize(11).text(title, x + 16, y + 14);

  rows.slice(0, 5).forEach(([label, value], index) => {
    const rowY = y + 36 + index * rowHeight;
    if (index > 0) {
      document.moveTo(x + 16, rowY).lineTo(x + width - 16, rowY).strokeColor(COLORS.border).lineWidth(0.6).stroke();
    }

    document
      .fillColor(COLORS.textSecondary)
      .font("Helvetica")
      .fontSize(9)
      .text(`${index + 1}. ${label}`, x + 16, rowY + 7, {
        width: width - 112,
        ellipsis: true,
      });
    document
      .fillColor(COLORS.textPrimary)
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(formatter(value), x + width - 88, rowY + 7, {
        width: 72,
        align: "right",
      });
  });

  if (!rows.length) {
    document.fillColor(COLORS.textSecondary).font("Helvetica").fontSize(9).text("Sem dados para exibir.", x + 16, y + 44);
  }

  document.restore();
}

function drawTableHeader(
  document: PdfDocument,
  columns: Array<{ key: string; label: string; width: number; align?: "left" | "right" | "center" }>,
  startY: number,
) {
  let currentX = PAGE_MARGIN;

  document.save();
  document.roundedRect(PAGE_MARGIN, startY, document.page.width - PAGE_MARGIN * 2, TABLE_HEADER_HEIGHT, 10).fill(
    COLORS.tableHeader,
  );

  columns.forEach((column) => {
    document
      .fillColor(COLORS.textPrimary)
      .font("Helvetica-Bold")
      .fontSize(8.2)
      .text(column.label, currentX + TABLE_CELL_PADDING, startY + 8, {
        width: column.width - TABLE_CELL_PADDING * 2,
        align: column.align ?? "left",
      });
    currentX += column.width;
  });

  document.restore();

  return startY + TABLE_HEADER_HEIGHT + 6;
}

function drawPageNumbers(document: PdfDocument) {
  const range = document.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(range.start + index);
    document
      .fillColor(COLORS.textMuted)
      .font("Helvetica")
      .fontSize(8)
      .text(`Pagina ${index + 1} de ${range.count}`, PAGE_MARGIN, document.page.height - PAGE_MARGIN + 4, {
        width: document.page.width - PAGE_MARGIN * 2,
        align: "right",
      });
  }
}

export async function buildDetailedFuelPdfReport({
  records,
  filters,
}: {
  records: FuelRecord[];
  filters: FuelReportFilters;
}) {
  const pdfkitModule = await import("pdfkit/js/pdfkit.standalone.js");
  const PDFDocument = pdfkitModule.default;
  const document = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: PAGE_MARGIN,
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
  const topSuppliers: Array<[string, number]> = costBySupplier.length
    ? costBySupplier.slice(0, 10)
    : [["Sem dados", 0]];
  const topVehicles: Array<[string, number]> = litersByVehicle.length
    ? litersByVehicle.slice(0, 10)
    : [["Sem dados", 0]];
  const generatedAt = new Date().toLocaleString("pt-BR");
  const sortedRecords = [...records].sort((left, right) => {
    const leftKey = `${left.date} ${left.time ?? ""}`;
    const rightKey = `${right.date} ${right.time ?? ""}`;

    return leftKey.localeCompare(rightKey);
  });

  const contentWidth = document.page.width - PAGE_MARGIN * 2;
  const summaryCardWidth = (contentWidth - CARD_GAP * 2) / 3;
  const summaryCardHeight = 64;
  const filterBoxWidth = (contentWidth - CARD_GAP * 3) / 4;

  drawHeader(document, "Relatorio Detalhado de Abastecimentos", `Gerado em ${generatedAt}`);

  drawSectionTitle(
    document,
    "Filtros aplicados",
    "Os dados abaixo consideram exatamente os filtros selecionados na tela antes do download.",
  );

  const filtersY = document.y;
  drawLabeledValueBox(document, PAGE_MARGIN, filtersY, filterBoxWidth, 48, "Placa / Veiculo", getFilterValue(filters.vehicle));
  drawLabeledValueBox(
    document,
    PAGE_MARGIN + filterBoxWidth + CARD_GAP,
    filtersY,
    filterBoxWidth,
    48,
    "Posto",
    getFilterValue(filters.supplier),
  );
  drawLabeledValueBox(
    document,
    PAGE_MARGIN + (filterBoxWidth + CARD_GAP) * 2,
    filtersY,
    filterBoxWidth,
    48,
    "Mes",
    filters.reportMonth || "Todos",
  );
  drawLabeledValueBox(
    document,
    PAGE_MARGIN + (filterBoxWidth + CARD_GAP) * 3,
    filtersY,
    filterBoxWidth,
    48,
    "Dia",
    filters.reportDay ? formatDate(filters.reportDay) : "Todos",
  );
  document.y = filtersY + 64;

  drawSectionTitle(document, "Resumo executivo", "Indicadores principais consolidados para a base filtrada.");

  const summaryY = document.y;
  drawInfoCard(document, PAGE_MARGIN, summaryY, summaryCardWidth, summaryCardHeight, "Total abastecido", formatCurrency(totalCost), `${records.length} registros`);
  drawInfoCard(
    document,
    PAGE_MARGIN + summaryCardWidth + CARD_GAP,
    summaryY,
    summaryCardWidth,
    summaryCardHeight,
    "Volume total",
    `${formatNumber(totalLiters)} L`,
    "Litros abastecidos",
  );
  drawInfoCard(
    document,
    PAGE_MARGIN + (summaryCardWidth + CARD_GAP) * 2,
    summaryY,
    summaryCardWidth,
    summaryCardHeight,
    "Preco medio",
    formatCurrency(averagePrice),
    "Media por litro",
  );

  drawInfoCard(
    document,
    PAGE_MARGIN,
    summaryY + summaryCardHeight + CARD_GAP,
    summaryCardWidth,
    summaryCardHeight,
    "Precos corretos",
    String(validCount),
    "Dentro do parametro",
  );
  drawInfoCard(
    document,
    PAGE_MARGIN + summaryCardWidth + CARD_GAP,
    summaryY + summaryCardHeight + CARD_GAP,
    summaryCardWidth,
    summaryCardHeight,
    "Precos divergentes",
    String(divergentCount),
    "Fora do parametro esperado",
  );
  drawInfoCard(
    document,
    PAGE_MARGIN + (summaryCardWidth + CARD_GAP) * 2,
    summaryY + summaryCardHeight + CARD_GAP,
    summaryCardWidth,
    summaryCardHeight,
    "Sem parametro",
    String(withoutRuleCount),
    "Sem regra cadastrada",
  );

  document.y = summaryY + summaryCardHeight * 2 + CARD_GAP + 20;

  drawSectionTitle(document, "Destaques", "Visao rapida dos maiores postos e veiculos dentro do periodo filtrado.");
  const rankingY = document.y;
  const rankingWidth = (contentWidth - CARD_GAP) / 2;
  drawRankingBox(document, PAGE_MARGIN, rankingY, rankingWidth, "Top postos por gasto", topSuppliers.slice(0, 5), formatCurrency);
  drawRankingBox(
    document,
    PAGE_MARGIN + rankingWidth + CARD_GAP,
    rankingY,
    rankingWidth,
    "Top veiculos por volume",
    topVehicles.slice(0, 5),
    (value) => `${formatNumber(value)} L`,
  );

  document.addPage();
  drawHeader(document, "Detalhamento dos abastecimentos", `Base filtrada em ${generatedAt}`);

  const columns = [
    { key: "date", label: "Data", width: 54 },
    { key: "time", label: "Hora", width: 40 },
    { key: "vehicle", label: "Veiculo / Placa", width: 100 },
    { key: "supplier", label: "Posto", width: 152 },
    { key: "fuelType", label: "Comb.", width: 62 },
    { key: "quantity", label: "Litros", width: 50, align: "right" as const },
    { key: "pricePerLiter", label: "Unit.", width: 60, align: "right" as const },
    { key: "expectedPricePerLiter", label: "Prev.", width: 60, align: "right" as const },
    { key: "status", label: "Status", width: 72, align: "center" as const },
    { key: "totalCost", label: "Total", width: 70, align: "right" as const },
  ];

  let currentY = drawTableHeader(document, columns, document.y);
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const bottomLimit = document.page.height - PAGE_MARGIN - FOOTER_HEIGHT;

  sortedRecords.forEach((record, index) => {
    const vehicleText = `${record.vehicle}\n${record.licensePlate || "-"}`;
    const supplierText = record.supplier || "-";
    const statusText = formatStatusLabel(record);

    document.font("Helvetica").fontSize(8.3);
    const vehicleHeight = document.heightOfString(vehicleText, {
      width: 100 - TABLE_CELL_PADDING * 2,
      align: "left",
    });
    const supplierHeight = document.heightOfString(supplierText, {
      width: 152 - TABLE_CELL_PADDING * 2,
      align: "left",
    });
    const statusHeight = document.heightOfString(statusText, {
      width: 72 - TABLE_CELL_PADDING * 2,
      align: "center",
    });

    const rowHeight = Math.max(28, vehicleHeight + 10, supplierHeight + 10, statusHeight + 10);

    if (currentY + rowHeight > bottomLimit) {
      document.addPage();
      drawHeader(document, "Detalhamento dos abastecimentos", `Continuidade do relatorio - ${generatedAt}`);
      currentY = drawTableHeader(document, columns, document.y);
    }

    if (index % 2 === 0) {
      document.save();
      document.roundedRect(PAGE_MARGIN, currentY, tableWidth, rowHeight, 8).fill(COLORS.cardBackground);
      document.restore();
    } else {
      document.save();
      document.roundedRect(PAGE_MARGIN, currentY, tableWidth, rowHeight, 8).fill(COLORS.rowAlternate);
      document.restore();
    }

    let currentX = PAGE_MARGIN;

    const drawCell = (
      text: string,
      width: number,
      options?: {
        align?: "left" | "right" | "center";
        bold?: boolean;
        color?: string;
        background?: string;
      },
    ) => {
      if (options?.background) {
        document.save();
        document.roundedRect(currentX + 4, currentY + 4, width - 8, rowHeight - 8, 8).fill(options.background);
        document.restore();
      }

      document
        .fillColor(options?.color ?? COLORS.textPrimary)
        .font(options?.bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.3)
        .text(text, currentX + TABLE_CELL_PADDING, currentY + 5, {
          width: width - TABLE_CELL_PADDING * 2,
          height: rowHeight - 10,
          align: options?.align ?? "left",
          ellipsis: true,
        });

      currentX += width;
    };

    drawCell(formatDate(record.date), 54);
    drawCell(record.time || "-", 40);
    drawCell(vehicleText, 100);
    drawCell(supplierText, 152);
    drawCell(record.fuelType || "-", 62);
    drawCell(formatNumber(record.quantity), 50, { align: "right" });
    drawCell(formatCurrency(record.pricePerLiter), 60, { align: "right" });
    drawCell(
      record.expectedPricePerLiter === null || record.expectedPricePerLiter === undefined
        ? "-"
        : formatCurrency(record.expectedPricePerLiter),
      60,
      { align: "right" },
    );

    const statusColors = getStatusColors(record);
    drawCell(statusText, 72, {
      align: "center",
      bold: true,
      color: statusColors.text,
      background: statusColors.background,
    });
    drawCell(formatCurrency(record.totalCost), 70, { align: "right", bold: true });

    document
      .moveTo(PAGE_MARGIN, currentY + rowHeight)
      .lineTo(PAGE_MARGIN + tableWidth, currentY + rowHeight)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();

    currentY += rowHeight + 4;
  });

  drawPageNumbers(document);

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
