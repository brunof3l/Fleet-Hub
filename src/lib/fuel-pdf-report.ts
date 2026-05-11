import type { FuelRecord, FuelReportFilters } from "@/types/fuel";

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
  const topSuppliers: Array<[string, number]> = costBySupplier.length
    ? costBySupplier.slice(0, 10)
    : [["Sem dados", 0]];
  const topVehicles: Array<[string, number]> = litersByVehicle.length
    ? litersByVehicle.slice(0, 10)
    : [["Sem dados", 0]];

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
