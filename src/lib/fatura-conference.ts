import { hasDatabaseConfig } from "@/lib/env";
import { parseFaturaPdf } from "@/lib/fatura-parser";
import { getSyncedInfleetRecords, type SyncedInfleetRecord } from "@/lib/infleet-sync";
import type {
  ConferenceMatchDetail,
  ConferenceResult,
  ConferenceStatus,
  FaturaLine,
  InfleetOnlyRecord,
} from "@/types/fuel";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const SUPPLIER_STOPWORDS = new Set([
  "auto",
  "posto",
  "postos",
  "ltda",
  "me",
  "epp",
  "eireli",
  "comercio",
  "comercial",
  "distribuidora",
  "combustivel",
  "combustiveis",
  "centro",
  "de",
  "do",
  "da",
  "e",
  "-",
]);

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const litersFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setTime(date.getTime() + days * DAY_IN_MS);
  return date.toISOString().slice(0, 10);
}

function dayDifference(left: string, right: string): number {
  const a = new Date(`${left}T00:00:00Z`).getTime();
  const b = new Date(`${right}T00:00:00Z`).getTime();
  return Math.round(Math.abs(a - b) / DAY_IN_MS);
}

function significantSupplierTokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !SUPPLIER_STOPWORDS.has(token)),
  );
}

function suppliersMatch(faturaSupplier: string, recordSupplier: string): boolean {
  const faturaTokens = significantSupplierTokens(faturaSupplier);
  const recordTokens = significantSupplierTokens(recordSupplier);

  if (!faturaTokens.size || !recordTokens.size) {
    return false;
  }

  for (const token of recordTokens) {
    if (faturaTokens.has(token)) {
      return true;
    }
  }

  return false;
}

function formatLiters(value: number): string {
  return `${litersFormatter.format(value)} L`;
}

function buildDivergences(line: FaturaLine, fuelling: SyncedInfleetRecord, dateDiff: number): string[] {
  const divergences: string[] = [];

  const quantityTolerance = Math.max(0.5, line.quantity * 0.01);
  if (Math.abs(line.quantity - fuelling.liters) > quantityTolerance) {
    divergences.push(
      `Litragem: fatura ${formatLiters(line.quantity)} x Infleet ${formatLiters(fuelling.liters)}`,
    );
  }

  const valueTolerance = Math.max(0.5, line.totalCost * 0.01);
  if (Math.abs(line.totalCost - fuelling.cost) > valueTolerance) {
    divergences.push(
      `Valor: fatura ${currencyFormatter.format(line.totalCost)} x Infleet ${currencyFormatter.format(fuelling.cost)}`,
    );
  }

  if (line.pricePerLiter > 0 && fuelling.unitPrice > 0) {
    const priceTolerance = Math.max(0.05, line.pricePerLiter * 0.01);
    if (Math.abs(line.pricePerLiter - fuelling.unitPrice) > priceTolerance) {
      divergences.push(
        `Preco/L: fatura ${currencyFormatter.format(line.pricePerLiter)} x Infleet ${currencyFormatter.format(fuelling.unitPrice)}`,
      );
    }
  }

  if (dateDiff > 0) {
    divergences.push(`Data divergente em ${dateDiff} dia(s)`);
  }

  return divergences;
}

export async function conferFaturaBuffer(
  _fileName: string,
  buffer: ArrayBuffer,
): Promise<ConferenceResult> {
  const parsed = await parseFaturaPdf(buffer);
  const lines = parsed.lines;

  const faturaTotalLiters = lines.reduce((sum, line) => sum + line.quantity, 0);
  const faturaTotalValue = lines.reduce((sum, line) => sum + line.totalCost, 0);

  if (!lines.length) {
    return {
      header: parsed.header,
      periodStart: "",
      periodEnd: "",
      totalLines: 0,
      conformeCount: 0,
      divergenteCount: 0,
      naoLancadoCount: 0,
      faturaTotalLiters,
      faturaTotalValue,
      matches: [],
      infleetOnly: [],
      message:
        "Nenhum lancamento foi reconhecido no PDF. Confira se o arquivo e o relatorio de detalhamento de faturas do posto.",
    };
  }

  const dates = lines.map((line) => line.date).filter(Boolean).sort();
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  if (!hasDatabaseConfig()) {
    return {
      header: parsed.header,
      periodStart,
      periodEnd,
      totalLines: lines.length,
      conformeCount: 0,
      divergenteCount: 0,
      naoLancadoCount: lines.length,
      faturaTotalLiters,
      faturaTotalValue,
      matches: lines.map((line) => ({
        line,
        status: "NAO_LANCADO" as ConferenceStatus,
        matchedRecord: null,
        divergences: [],
      })),
      infleetOnly: [],
      message: "Banco de dados nao configurado.",
    };
  }

  const fuellings = await getSyncedInfleetRecords(shiftDate(periodStart, -1), shiftDate(periodEnd, 1));

  const fuellingsByPlate = new Map<string, SyncedInfleetRecord[]>();
  fuellings.forEach((fuelling) => {
    if (!fuelling.plate) {
      return;
    }
    const current = fuellingsByPlate.get(fuelling.plate);
    if (current) {
      current.push(fuelling);
    } else {
      fuellingsByPlate.set(fuelling.plate, [fuelling]);
    }
  });

  const usedIds = new Set<string>();

  const matches: ConferenceMatchDetail[] = lines.map((line) => {
    const candidates = (fuellingsByPlate.get(line.plate) ?? []).filter(
      (fuelling) => !usedIds.has(fuelling.id) && dayDifference(fuelling.date, line.date) <= 1,
    );

    if (!candidates.length) {
      return {
        line,
        status: "NAO_LANCADO" as ConferenceStatus,
        matchedRecord: null,
        divergences: [],
      };
    }

    candidates.sort((left, right) => {
      const leftScore =
        Math.abs(left.liters - line.quantity) + dayDifference(left.date, line.date) * 1000;
      const rightScore =
        Math.abs(right.liters - line.quantity) + dayDifference(right.date, line.date) * 1000;
      return leftScore - rightScore;
    });

    const best = candidates[0];
    usedIds.add(best.id);

    const divergences = buildDivergences(line, best, dayDifference(best.date, line.date));
    const status: ConferenceStatus = divergences.length ? "DIVERGENTE" : "CONFORME";

    return {
      line,
      status,
      matchedRecord: {
        id: best.id,
        date: best.date,
        vehicle: best.vehicleName,
        quantity: best.liters,
        pricePerLiter: best.unitPrice,
        totalCost: best.cost,
      },
      divergences,
    };
  });

  const infleetOnly: InfleetOnlyRecord[] = fuellings
    .filter((fuelling) => {
      if (usedIds.has(fuelling.id)) {
        return false;
      }
      if (fuelling.date < periodStart || fuelling.date > periodEnd) {
        return false;
      }
      return suppliersMatch(parsed.header.supplier, fuelling.supplier);
    })
    .map((fuelling) => ({
      id: fuelling.id,
      date: fuelling.date,
      vehicle: fuelling.vehicleName,
      plate: fuelling.plate,
      supplier: fuelling.supplier,
      quantity: fuelling.liters,
      totalCost: fuelling.cost,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const conformeCount = matches.filter((match) => match.status === "CONFORME").length;
  const divergenteCount = matches.filter((match) => match.status === "DIVERGENTE").length;
  const naoLancadoCount = matches.filter((match) => match.status === "NAO_LANCADO").length;

  const message =
    fuellings.length === 0
      ? "Nenhum abastecimento do Infleet encontrado para o periodo. Clique em \"Sincronizar Infleet\" na pagina Combustivel para atualizar a base."
      : undefined;

  return {
    header: parsed.header,
    periodStart,
    periodEnd,
    totalLines: lines.length,
    conformeCount,
    divergenteCount,
    naoLancadoCount,
    faturaTotalLiters,
    faturaTotalValue,
    matches,
    infleetOnly,
    message,
  };
}
