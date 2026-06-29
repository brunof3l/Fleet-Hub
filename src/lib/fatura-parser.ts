import type { FaturaHeader, FaturaLine, ParseFaturaResult } from "@/types/fuel";

type TextToken = {
  x: number;
  y: number;
  str: string;
};

type LineToken = {
  y: number;
  tokens: TextToken[];
};

type ColumnAnchor = {
  field: ColumnField;
  x: number;
};

type ColumnField =
  | "doc"
  | "date"
  | "plate"
  | "quantity"
  | "kmStart"
  | "kmEnd"
  | "kmPerLiter"
  | "fuelType"
  | "unitPrice"
  | "acres"
  | "desc"
  | "total";

const DATE_REGEX = /(\d{2})\/(\d{2})\/(\d{4})/;
const PLATE_REGEX = /[A-Z]{3}[0-9][A-Z0-9][0-9]{2}/;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrNumber(value: string): number {
  const text = String(value ?? "").trim();
  if (!text) {
    return 0;
  }

  const cleaned = text
    .replace(/[R$\s]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brDateToIso(value: string): string {
  const match = value.match(DATE_REGEX);
  if (!match) {
    return "";
  }

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizePlate(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

/**
 * Groups raw pdf.js text items (which arrive unordered) into visual lines by
 * rounding their vertical position, then sorts each line left-to-right.
 */
function groupIntoLines(tokens: TextToken[]): LineToken[] {
  const buckets = new Map<number, TextToken[]>();

  tokens.forEach((token) => {
    if (!token.str.trim()) {
      return;
    }

    const key = Math.round(token.y);
    const current = buckets.get(key);
    if (current) {
      current.push(token);
    } else {
      buckets.set(key, [token]);
    }
  });

  return Array.from(buckets.entries())
    .map(([y, items]) => ({
      y,
      tokens: items.sort((left, right) => left.x - right.x),
    }))
    .sort((left, right) => right.y - left.y);
}

function findColumnAnchors(line: LineToken): ColumnAnchor[] | null {
  const anchors: ColumnAnchor[] = [];

  line.tokens.forEach((token) => {
    const label = normalizeText(token.str);

    if (label.includes("doc.fiscal") || label.includes("doc fiscal")) {
      anchors.push({ field: "doc", x: token.x });
    } else if (label === "emissao" || label.endsWith(" emissao")) {
      anchors.push({ field: "date", x: token.x });
    } else if (label === "placa") {
      anchors.push({ field: "plate", x: token.x });
    } else if (label === "qtde") {
      anchors.push({ field: "quantity", x: token.x });
    } else if (label.includes("km inic")) {
      anchors.push({ field: "kmStart", x: token.x });
    } else if (label.includes("km final")) {
      anchors.push({ field: "kmEnd", x: token.x });
    } else if (label.includes("km/lt") || label.includes("km/l")) {
      anchors.push({ field: "kmPerLiter", x: token.x });
    } else if (label === "item") {
      anchors.push({ field: "fuelType", x: token.x });
    } else if (label.includes("vl. un") || label.includes("vl un")) {
      anchors.push({ field: "unitPrice", x: token.x });
    } else if (label.includes("acres")) {
      anchors.push({ field: "acres", x: token.x });
    } else if (label.includes("desc")) {
      anchors.push({ field: "desc", x: token.x });
    } else if (label.includes("vl. total") || label.includes("vl total")) {
      anchors.push({ field: "total", x: token.x });
    }
  });

  const hasPlate = anchors.some((anchor) => anchor.field === "plate");
  const hasTotal = anchors.some((anchor) => anchor.field === "total");

  if (!hasPlate || !hasTotal) {
    return null;
  }

  return anchors.sort((left, right) => left.x - right.x);
}

function bucketByAnchor(line: LineToken, anchors: ColumnAnchor[]): Map<ColumnField, string> {
  const result = new Map<ColumnField, string>();

  line.tokens.forEach((token) => {
    if (!token.str.trim()) {
      return;
    }

    let nearest = anchors[0];
    let nearestDistance = Math.abs(token.x - anchors[0].x);

    anchors.forEach((anchor) => {
      const distance = Math.abs(token.x - anchor.x);
      if (distance < nearestDistance) {
        nearest = anchor;
        nearestDistance = distance;
      }
    });

    const previous = result.get(nearest.field);
    result.set(nearest.field, previous ? `${previous} ${token.str.trim()}` : token.str.trim());
  });

  return result;
}

function isStopLine(line: LineToken): boolean {
  const text = normalizeText(line.tokens.map((token) => token.str).join(" "));
  return (
    text.startsWith("subtotal") ||
    text.startsWith("total:") ||
    text.startsWith("total ") ||
    text.includes("resumo por item") ||
    text.includes("vencimento")
  );
}

function buildLineFromColumns(columns: Map<ColumnField, string>): FaturaLine | null {
  const rawDate = (columns.get("date") ?? "").trim();
  const isoDate = brDateToIso(rawDate);
  const rawPlate = (columns.get("plate") ?? "").trim();
  const plate = normalizePlate(rawPlate);

  if (!isoDate || !plate || !PLATE_REGEX.test(plate)) {
    return null;
  }

  const quantity = parseBrNumber(columns.get("quantity") ?? "0");
  const totalCost = parseBrNumber(columns.get("total") ?? "0");

  if (quantity <= 0 && totalCost <= 0) {
    return null;
  }

  const kmStart = columns.has("kmStart") ? parseBrNumber(columns.get("kmStart") ?? "") : 0;
  const kmEnd = columns.has("kmEnd") ? parseBrNumber(columns.get("kmEnd") ?? "") : 0;
  const kmPerLiter = columns.has("kmPerLiter") ? parseBrNumber(columns.get("kmPerLiter") ?? "") : 0;

  return {
    documentNumber: (columns.get("doc") ?? "").replace(/[^0-9]/g, "").trim(),
    date: isoDate,
    rawDate,
    plate,
    rawPlate,
    quantity,
    odometerStart: kmStart > 0 ? kmStart : null,
    odometerEnd: kmEnd > 0 ? kmEnd : null,
    kmPerLiter: kmPerLiter > 0 ? kmPerLiter : null,
    fuelType: (columns.get("fuelType") ?? "").trim() || "Nao informado",
    pricePerLiter: parseBrNumber(columns.get("unitPrice") ?? "0"),
    totalCost,
  };
}

function extractHeader(allLines: LineToken[]): FaturaHeader {
  const fullText = allLines
    .map((line) => line.tokens.map((token) => token.str).join(" "))
    .join("\n");

  const invoiceMatch = fullText.match(/N[º°o]?\s*Fatura:?\s*([0-9][0-9./-]*)/i);
  const issueMatch = fullText.match(/Emiss[aã]o:?\s*(\d{2}\/\d{2}\/\d{4})/i);
  const clientMatch = fullText.match(/Cliente:?\s*([^\n]+)/i);

  let supplier = "";
  for (const line of allLines) {
    const text = line.tokens.map((token) => token.str).join(" ").trim();
    const normalized = normalizeText(text);
    if (!text || normalized.includes("relatorio de detalhamento")) {
      continue;
    }
    if (
      normalized.includes("posto") ||
      normalized.includes("ltda") ||
      normalized.includes("combust") ||
      normalized.includes("auto")
    ) {
      supplier = text;
      break;
    }
  }

  return {
    supplier: supplier || "Posto nao identificado",
    invoiceNumber: invoiceMatch?.[1]?.trim() ?? "",
    issueDate: issueMatch?.[1]?.trim() ?? "",
    client: clientMatch?.[1]?.trim() ?? "",
  };
}

/**
 * Extracts the structured fuel transactions out of a "Relatorio de Detalhamento
 * de Faturas" PDF using positional reconstruction. We bucket each text token to
 * the nearest table column anchor detected from the header row, which is robust
 * to rows with blank odometer columns and to multi-page invoices.
 */
export async function parseFaturaPdf(buffer: ArrayBuffer): Promise<ParseFaturaResult> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));

  const allLines: LineToken[] = [];
  const lines: FaturaLine[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();

    const tokens: TextToken[] = textContent.items
      .filter((item): item is typeof item & { str: string; transform: number[] } => "str" in item)
      .map((item) => ({
        x: item.transform[4],
        y: item.transform[5],
        str: item.str,
      }));

    const pageLines = groupIntoLines(tokens);
    allLines.push(...pageLines);

    let anchors: ColumnAnchor[] | null = null;

    for (const line of pageLines) {
      const detectedAnchors = findColumnAnchors(line);
      if (detectedAnchors) {
        anchors = detectedAnchors;
        continue;
      }

      if (!anchors) {
        continue;
      }

      if (isStopLine(line)) {
        anchors = null;
        continue;
      }

      const columns = bucketByAnchor(line, anchors);
      const faturaLine = buildLineFromColumns(columns);
      if (faturaLine) {
        lines.push(faturaLine);
      }
    }
  }

  return {
    header: extractHeader(allLines),
    lines,
  };
}
