import OpenAI from "openai";
import { z } from "zod";

import { getOpenAiApiKey } from "@/lib/env";
import { getRecordsByPeriod } from "@/lib/fleet-service";
import type {
  AuditExtractedItem,
  AuditProcessResponse,
  AuditResultRow,
  AuditStatus,
  AuditSummary,
} from "@/types/audit";
import type { FuelRecord } from "@/types/fuel";

const AUDIT_MODEL = "gpt-4o";
const VALUE_TOLERANCE = 1;
const LITERS_TOLERANCE = 0.5;
const PDF_BATCH_SIZE = 3;

const extractionSchema = z.object({
  itens: z.array(
    z.object({
      placa: z.string(),
      data: z.string(),
      litros: z.number(),
      valorTotal: z.number(),
      estabelecimento: z.string(),
      produto: z.string(),
    }),
  ),
});

const openAiJsonSchema = {
  name: "itens_fatura_combustivel",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      itens: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            placa: {
              type: "string",
              description: "Placa formatada como AAA-1234 ou AAA1A23.",
            },
            data: {
              type: "string",
              description: "Data do abastecimento no formato DD/MM/YYYY.",
            },
            litros: {
              type: "number",
              description: "Quantidade de litros do abastecimento principal.",
            },
            valorTotal: {
              type: "number",
              description: "Valor total cobrado pelo abastecimento principal em reais.",
            },
            estabelecimento: {
              type: "string",
              description: "Nome do posto ou estabelecimento emissor.",
            },
            produto: {
              type: "string",
              description:
                "Descricao do produto principal identificado na linha ou cupom, por exemplo DIESEL S10, GASOLINA, ETANOL ou ARLA 32.",
            },
          },
          required: ["placa", "data", "litros", "valorTotal", "estabelecimento", "produto"],
        },
      },
    },
    required: ["itens"],
  },
} as const;

function normalizePlateKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeTextKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNonFuelProduct(value: string): boolean {
  const normalized = normalizeTextKey(value);

  return [
    "arla",
    "arla 32",
    "lubrificante",
    "oleo",
    "filtro",
    "lavagem",
    "conveniencia",
    "aditivo",
    "graxa",
  ].some((term) => normalized.includes(term));
}

function getFuelFamily(value: string): "diesel" | "gasolina" | "etanol" | "gnv" | "other" {
  const normalized = normalizeTextKey(value);

  if (normalized.includes("diesel") || normalized.includes("s10") || normalized.includes("s 10")) {
    return "diesel";
  }

  if (normalized.includes("gasolina")) {
    return "gasolina";
  }

  if (normalized.includes("etanol") || normalized.includes("alcool")) {
    return "etanol";
  }

  if (normalized.includes("gnv") || normalized.includes("gas natural")) {
    return "gnv";
  }

  return "other";
}

function getTextTokens(value: string): string[] {
  return normalizeTextKey(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function getSupplierSimilarity(left: string, right: string): number {
  const leftTokens = new Set(getTextTokens(left));
  const rightTokens = new Set(getTextTokens(right));

  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  let intersection = 0;

  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  });

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function splitIntoChunks<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

function formatPlate(value: string): string {
  const normalized = normalizePlateKey(value);

  if (/^[A-Z]{3}\d{4}$/.test(normalized)) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3)}`;
  }

  if (/^[A-Z]{3}\d[A-Z]\d{2}$/.test(normalized)) {
    return normalized;
  }

  return value.trim().toUpperCase();
}

function parseBrazilianDate(value: string): string | null {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function pickSystemPlate(record: FuelRecord): string {
  const rawVehicle = String(record.raw.Veiculo ?? record.vehicle ?? record.licensePlate ?? "").trim();
  return formatPlate(rawVehicle || record.licensePlate || record.vehicle);
}

function normalizeExtractedItems(items: z.infer<typeof extractionSchema>["itens"]): AuditExtractedItem[] {
  return items
    .map((item) => {
      const dateIso = parseBrazilianDate(item.data);
      const plate = formatPlate(item.placa);
      const liters = Number(item.litros);
      const total = Number(item.valorTotal);

      if (
        !dateIso ||
        !plate ||
        !Number.isFinite(liters) ||
        !Number.isFinite(total) ||
        isNonFuelProduct(item.produto)
      ) {
        return null;
      }

      return {
        placa: plate,
        data: item.data,
        litros: liters,
        valorTotal: total,
        estabelecimento: item.estabelecimento.trim() || "Nao informado",
        produto: item.produto.trim() || "Nao informado",
        dateIso,
        plateKey: normalizePlateKey(plate),
      } satisfies AuditExtractedItem;
    })
    .filter((item): item is AuditExtractedItem => Boolean(item));
}

async function extractItemsWithVision(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  pageImages?: string[];
}): Promise<AuditExtractedItem[]> {
  const client = new OpenAI({
    apiKey: getOpenAiApiKey(),
  });

  const imagePayloads =
    input.mimeType === "application/pdf"
      ? input.pageImages?.filter(Boolean) ?? []
      : [toDataUrl(input.buffer, input.mimeType)];

  if (!imagePayloads.length) {
    throw new Error("Nao foi possivel gerar imagens validas para analisar o documento.");
  }

  const payloadChunks =
    input.mimeType === "application/pdf"
      ? splitIntoChunks(imagePayloads, PDF_BATCH_SIZE)
      : [imagePayloads];

  const extractedByChunk = await Promise.all(
    payloadChunks.map(async (chunk, chunkIndex) => {
      const completion = await client.chat.completions.create({
        model: AUDIT_MODEL,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: openAiJsonSchema,
        },
        messages: [
          {
            role: "system",
            content:
              "Voce extrai todos os abastecimentos de combustivel visiveis nas paginas recebidas. " +
              "Responda somente em JSON valido seguindo o schema exigido. " +
              "Para relatorios tabulares, extraia cada linha de abastecimento de combustivel separadamente. " +
              "Para cupons fiscais, extraia o abastecimento principal de combustivel daquele cupom. " +
              "Ignore produtos que nao sejam combustivel, como Arla 32, lubrificantes, loja, lavagem ou conveniencia, " +
              "exceto quando estiverem embutidos no valor do abastecimento principal e nao houver como separar. " +
              "Nunca retorne apenas um resumo geral do documento se houver varias linhas ou varias paginas; extraia item por item. " +
              "Inclua no campo produto o nome do combustivel ou item identificado na linha. " +
              "Padronize a placa como AAA-1234 ou AAA1A23 e a data como DD/MM/YYYY. " +
              "Se nao houver itens suficientes, retorne o array vazio.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Analise integralmente este lote ${chunkIndex + 1} de ${payloadChunks.length}. ` +
                  "Extraia todos os abastecimentos de combustivel visiveis neste lote, um item por abastecimento, sem resumir. " +
                  "Nao inclua ARLA, lubrificantes ou itens de loja. Preencha o campo produto com o item lido.",
              },
              ...chunk.map((imageUrl) => ({
                type: "image_url" as const,
                image_url: {
                  url: imageUrl,
                },
              })),
            ],
          },
        ],
      });

      const content = completion.choices[0]?.message?.content;

      if (!content) {
        throw new Error("A IA nao retornou conteudo suficiente para a auditoria.");
      }

      const parsed = extractionSchema.parse(JSON.parse(content));
      return normalizeExtractedItems(parsed.itens);
    }),
  );

  const deduped = new Map<string, AuditExtractedItem>();

  extractedByChunk.flat().forEach((item) => {
    const dedupeKey = [
      item.plateKey,
      item.dateIso,
      item.estabelecimento.toLowerCase(),
      item.valorTotal.toFixed(2),
      item.litros.toFixed(3),
    ].join("|");

    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, item);
    }
  });

  return Array.from(deduped.values());
}

function buildRecordMap(records: FuelRecord[]) {
  const map = new Map<string, FuelRecord[]>();

  records.forEach((record) => {
    const key = `${normalizePlateKey(pickSystemPlate(record))}|${record.date}`;
    const current = map.get(key) ?? [];
    current.push(record);
    map.set(key, current);
  });

  return map;
}

function getMatchScore(item: AuditExtractedItem, record: FuelRecord): number {
  const totalDifference = Math.abs(record.totalCost - item.valorTotal);
  const litersDifference = Math.abs(record.quantity - item.litros);
  const supplierSimilarity = getSupplierSimilarity(item.estabelecimento, record.supplier);
  const itemFuelFamily = getFuelFamily(item.produto);
  const recordFuelFamily = getFuelFamily(record.fuelType);
  const fuelMismatchPenalty =
    itemFuelFamily !== "other" && recordFuelFamily !== "other" && itemFuelFamily !== recordFuelFamily
      ? 6
      : 0;

  const supplierPenalty = supplierSimilarity > 0 ? 1 - supplierSimilarity : 0.65;
  const totalPenalty = totalDifference / VALUE_TOLERANCE;
  const litersPenalty = litersDifference / LITERS_TOLERANCE;

  return totalPenalty * 4 + litersPenalty * 3 + supplierPenalty * 2 + fuelMismatchPenalty;
}

function isPlausibleMatch(item: AuditExtractedItem, record: FuelRecord): boolean {
  const totalDifference = Math.abs(record.totalCost - item.valorTotal);
  const litersDifference = Math.abs(record.quantity - item.litros);
  const supplierSimilarity = getSupplierSimilarity(item.estabelecimento, record.supplier);
  const itemFuelFamily = getFuelFamily(item.produto);
  const recordFuelFamily = getFuelFamily(record.fuelType);
  const fuelFamilyMismatch =
    itemFuelFamily !== "other" && recordFuelFamily !== "other" && itemFuelFamily !== recordFuelFamily;

  if (fuelFamilyMismatch) {
    return false;
  }

  if (totalDifference < VALUE_TOLERANCE && litersDifference <= LITERS_TOLERANCE) {
    return true;
  }

  if (supplierSimilarity >= 0.45 && totalDifference <= 3 && litersDifference <= 1) {
    return true;
  }

  return false;
}

function matchRecordsForKey(items: AuditExtractedItem[], records: FuelRecord[]) {
  const matches = new Map<number, FuelRecord | null>();

  if (!records.length) {
    items.forEach((_, index) => matches.set(index, null));
    return matches;
  }

  const candidatePairs = items.flatMap((item, itemIndex) =>
    records.map((record) => ({
      itemIndex,
      record,
      score: getMatchScore(item, record),
      totalDifference: Math.abs(record.totalCost - item.valorTotal),
      litersDifference: Math.abs(record.quantity - item.litros),
      supplierSimilarity: getSupplierSimilarity(item.estabelecimento, record.supplier),
    })),
  );

  candidatePairs.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }

    if (left.totalDifference !== right.totalDifference) {
      return left.totalDifference - right.totalDifference;
    }

    if (left.litersDifference !== right.litersDifference) {
      return left.litersDifference - right.litersDifference;
    }

    return right.supplierSimilarity - left.supplierSimilarity;
  });

  const usedItems = new Set<number>();
  const usedRecords = new Set<string>();

  candidatePairs.forEach((candidate) => {
    if (usedItems.has(candidate.itemIndex) || usedRecords.has(candidate.record.id)) {
      return;
    }

    if (!isPlausibleMatch(items[candidate.itemIndex], candidate.record)) {
      return;
    }

    usedItems.add(candidate.itemIndex);
    usedRecords.add(candidate.record.id);
    matches.set(candidate.itemIndex, candidate.record);
  });

  items.forEach((_, index) => {
    if (!matches.has(index)) {
      matches.set(index, null);
    }
  });

  return matches;
}

function groupItemsByKey(items: AuditExtractedItem[]) {
  const groups = new Map<string, AuditExtractedItem[]>();

  items.forEach((item) => {
    const key = `${item.plateKey}|${item.dateIso}`;
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  });

  return groups;
}

function buildAuditRow(item: AuditExtractedItem, systemRecord: FuelRecord | null): AuditResultRow {
  if (!systemRecord) {
    return {
      id: `${item.plateKey}-${item.dateIso}-missing`,
      status: "NAO_NO_SISTEMA",
      invoice: item,
      systemRecord: null,
      totalDifference: null,
      litersDifference: null,
    };
  }

  const totalDifference = item.valorTotal - systemRecord.totalCost;
  const litersDifference = item.litros - systemRecord.quantity;
  const withinValueTolerance = Math.abs(totalDifference) < VALUE_TOLERANCE;
  const withinLitersTolerance = Math.abs(litersDifference) <= LITERS_TOLERANCE;
  const status: AuditStatus =
    withinValueTolerance && withinLitersTolerance ? "MATCH_PERFEITO" : "DIVERGENCIA";

  return {
    id: `${item.plateKey}-${item.dateIso}-${systemRecord.id}`,
    status,
    invoice: item,
    systemRecord: {
      id: systemRecord.id,
      date: systemRecord.date,
      vehicle: systemRecord.vehicle,
      supplier: systemRecord.supplier,
      quantity: systemRecord.quantity,
      totalCost: systemRecord.totalCost,
      fuelType: systemRecord.fuelType,
    },
    totalDifference,
    litersDifference,
  };
}

function buildSummary(results: AuditResultRow[]): AuditSummary {
  const totalInvoiced = results.reduce((sum, row) => sum + row.invoice.valorTotal, 0);
  const totalSystem = results.reduce((sum, row) => sum + (row.systemRecord?.totalCost ?? 0), 0);

  return {
    totalInvoiced,
    totalSystem,
    totalDifference: totalInvoiced - totalSystem,
    totalItems: results.length,
    perfectCount: results.filter((row) => row.status === "MATCH_PERFEITO").length,
    divergenceCount: results.filter((row) => row.status === "DIVERGENCIA").length,
    missingCount: results.filter((row) => row.status === "NAO_NO_SISTEMA").length,
  };
}

export async function processAuditDocument(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  pageImages?: string[];
}): Promise<AuditProcessResponse> {
  const extractedItems = await extractItemsWithVision(input);

  if (!extractedItems.length) {
    return {
      fileName: input.fileName,
      mimeType: input.mimeType,
      model: AUDIT_MODEL,
      months: [],
      extractedCount: 0,
      summary: {
        totalInvoiced: 0,
        totalSystem: 0,
        totalDifference: 0,
        totalItems: 0,
        perfectCount: 0,
        divergenceCount: 0,
        missingCount: 0,
      },
      results: [],
    };
  }

  const orderedDates = extractedItems
    .map((item) => item.dateIso)
    .sort((left, right) => left.localeCompare(right));
  const startDate = orderedDates[0] ?? "";
  const endDate = orderedDates[orderedDates.length - 1] ?? "";
  const months = Array.from(new Set(extractedItems.map((item) => item.dateIso.slice(0, 7)))).sort();

  const systemRecords = await getRecordsByPeriod(startDate, endDate);
  const recordsMap = buildRecordMap(systemRecords);
  const itemGroups = groupItemsByKey(extractedItems);
  const results: AuditResultRow[] = [];

  itemGroups.forEach((items, key) => {
    const candidates = recordsMap.get(key) ?? [];
    const matchedByIndex = matchRecordsForKey(items, candidates);

    items.forEach((item, index) => {
      results.push(buildAuditRow(item, matchedByIndex.get(index) ?? null));
    });
  });

  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    model: AUDIT_MODEL,
    months,
    extractedCount: extractedItems.length,
    summary: buildSummary(results),
    results,
  };
}
