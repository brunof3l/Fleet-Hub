import * as XLSX from "xlsx";

import type {
  SpeedAnalysisResult,
  SpeedBlock,
  SpeedCellValue,
  SpeedColumnMap,
  SpeedReportEntry,
  SpeedSheetRow,
  SpeedViolation,
} from "@/types/speed";

export const SPEED_LIMIT_KMH = 130;
export const MIN_DURATION_MINUTES = 1;

function normalizeHeading(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function cleanText(value: SpeedCellValue): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseNumber(value: SpeedCellValue): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = cleanText(value);
  if (!text) {
    return null;
  }

  let normalized = text.replace(/\s/g, "");

  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseExcelDate(serial: number): Date {
  const days = Math.floor(serial);
  const fraction = serial - days;
  const date = new Date(1899, 11, 30);

  date.setDate(date.getDate() + days);

  const totalSeconds = Math.round(fraction * 24 * 60 * 60);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  date.setHours(hours, minutes, seconds, 0);
  return date;
}

function parseDate(value: SpeedCellValue): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return parseExcelDate(value);
  }

  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const brMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );

  if (brMatch) {
    const [, dayText, monthText, yearText, hourText, minuteText, secondText] = brMatch;
    const year = yearText.length === 2 ? Number(`20${yearText}`) : Number(yearText);
    const date = new Date(
      year,
      Number(monthText) - 1,
      Number(dayText),
      Number(hourText ?? "0"),
      Number(minuteText ?? "0"),
      Number(secondText ?? "0"),
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimeParts(value: SpeedCellValue): { hours: number; minutes: number; seconds: number } | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return {
      hours: value.getHours(),
      minutes: value.getMinutes(),
      seconds: value.getSeconds(),
    };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = value >= 1 ? value % 1 : value;
    const totalSeconds = Math.round(normalized * 24 * 60 * 60);

    return {
      hours: Math.floor(totalSeconds / 3600) % 24,
      minutes: Math.floor((totalSeconds % 3600) / 60),
      seconds: totalSeconds % 60,
    };
  }

  const text = cleanText(value);
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    return null;
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
    seconds: Number(match[3] ?? "0"),
  };
}

function combineDateAndTime(dateValue: SpeedCellValue, timeValue?: SpeedCellValue): Date | null {
  const baseDate = parseDate(dateValue);
  if (!baseDate) {
    return null;
  }

  const timeParts = parseTimeParts(timeValue);
  if (!timeParts) {
    return baseDate;
  }

  const combined = new Date(baseDate);
  combined.setHours(timeParts.hours, timeParts.minutes, timeParts.seconds, 0);
  return combined;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(value: Date): string {
  return `${pad2(value.getDate())}/${pad2(value.getMonth() + 1)}/${value.getFullYear()} ${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
}

function formatDateLabel(dateValue: SpeedCellValue, timeValue: SpeedCellValue | undefined, fallback: Date): string {
  const dateText = cleanText(dateValue);
  const timeText = cleanText(timeValue);
  const dateTextHasTime = /\d{1,2}:\d{2}/.test(dateText);

  if (dateText && timeText && !dateTextHasTime) {
    return `${dateText} ${timeText}`.trim();
  }

  if (dateText) {
    return dateText;
  }

  return formatDateTime(fallback);
}

function findColumn(headings: string[], candidates: string[]): string | undefined {
  const normalizedCandidates = candidates.map(normalizeHeading);
  return headings.find((heading) => normalizedCandidates.includes(normalizeHeading(heading)));
}

function mapColumns(headings: string[]): SpeedColumnMap | null {
  const date = findColumn(headings, ["Data"]);
  const time = findColumn(headings, ["Hora", "Horario", "Horário"]);
  const vehicle = findColumn(headings, ["Veiculo", "Veículo"]);
  const speed = findColumn(headings, ["Velocidade"]);

  if (!date || !vehicle || !speed) {
    return null;
  }

  return {
    date,
    vehicle,
    speed,
    time,
    driver: findColumn(headings, ["Motorista"]),
    address: findColumn(headings, ["Endereco", "Endereço"]),
  };
}

function closeBlock(block: SpeedBlock | null, violations: SpeedViolation[]) {
  if (!block) {
    return;
  }

  const durationMs = block.endDate.getTime() - block.startDate.getTime();
  const durationMinutes = durationMs / (1000 * 60);

  if (durationMinutes >= MIN_DURATION_MINUTES) {
    violations.push({
      vehicle: block.vehicle,
      driver: block.driver,
      address: block.address,
      startDate: block.startDate,
      startLabel: block.startLabel,
      endDate: block.endDate,
      endLabel: block.endLabel,
      durationMinutes: durationMinutes.toFixed(1),
      maxSpeed: block.maxSpeed,
    });
  }
}

function toReportEntry(row: SpeedSheetRow, columns: SpeedColumnMap): SpeedReportEntry | null {
  const date = combineDateAndTime(row[columns.date], columns.time ? row[columns.time] : undefined);
  const speed = parseNumber(row[columns.speed]);
  const vehicle = cleanText(row[columns.vehicle]);

  if (!date || speed === null || !vehicle) {
    return null;
  }

  return {
    date,
    dateLabel: formatDateLabel(row[columns.date], columns.time ? row[columns.time] : undefined, date),
    vehicle,
    speed,
    driver: columns.driver ? cleanText(row[columns.driver]) || "---" : "---",
    address: columns.address ? cleanText(row[columns.address]) || "---" : "---",
  };
}

export function normalizeVehicleKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .trim()
    .toUpperCase();
}

export function analyzeSpeedWorkbook(fileName: string, buffer: ArrayBuffer): SpeedAnalysisResult {
  try {
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true,
      raw: true,
    });

    const sheetName = workbook.SheetNames[0] ?? null;

    if (!sheetName) {
      return {
        fileName,
        sheetName: null,
        violations: [],
        error: "A planilha nao contem nenhuma aba legivel.",
      };
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<SpeedSheetRow>(worksheet, {
      defval: null,
      raw: true,
    });

    if (!rawRows.length) {
      return {
        fileName,
        sheetName,
        violations: [],
        error: "A aba selecionada esta vazia.",
      };
    }

    const headings = Object.keys(rawRows[0]);
    const columns = mapColumns(headings);

    if (!columns) {
      return {
        fileName,
        sheetName,
        violations: [],
        error: "Nao encontrei as colunas obrigatorias Data, Veiculo e Velocidade.",
      };
    }

    const entries = rawRows
      .map((row) => toReportEntry(row, columns))
      .filter((item): item is SpeedReportEntry => item !== null);

    if (!entries.length) {
      return {
        fileName,
        sheetName,
        violations: [],
        error: "Nao encontrei linhas validas para analisar neste relatorio.",
      };
    }

    entries.sort((left, right) => {
      const vehicleCompare = left.vehicle.localeCompare(right.vehicle);
      if (vehicleCompare !== 0) {
        return vehicleCompare;
      }

      return left.date.getTime() - right.date.getTime();
    });

    const violations: SpeedViolation[] = [];
    let currentBlock: SpeedBlock | null = null;

    for (const entry of entries) {
      if (entry.speed > SPEED_LIMIT_KMH) {
        if (!currentBlock || currentBlock.vehicle !== entry.vehicle) {
          closeBlock(currentBlock, violations);

          currentBlock = {
            vehicle: entry.vehicle,
            driver: entry.driver,
            address: entry.address,
            startDate: entry.date,
            startLabel: entry.dateLabel,
            endDate: entry.date,
            endLabel: entry.dateLabel,
            maxSpeed: entry.speed,
          };
        } else {
          currentBlock.endDate = entry.date;
          currentBlock.endLabel = entry.dateLabel;
          currentBlock.address = entry.address || currentBlock.address;
          currentBlock.driver = entry.driver || currentBlock.driver;
          currentBlock.maxSpeed = Math.max(currentBlock.maxSpeed, entry.speed);
        }
      } else if (currentBlock) {
        closeBlock(currentBlock, violations);
        currentBlock = null;
      }
    }

    closeBlock(currentBlock, violations);

    return {
      fileName,
      sheetName,
      violations,
    };
  } catch {
    return {
      fileName,
      sheetName: null,
      violations: [],
      error: "Nao foi possivel ler o arquivo XLSX. Verifique se o relatorio esta valido.",
    };
  }
}

export function buildViolationExportRows(violations: SpeedViolation[]) {
  return violations.map((violation) => ({
    Veiculo: violation.vehicle,
    Motorista: violation.driver,
    Inicio: violation.startLabel,
    Fim: violation.endLabel,
    "Duracao (Minutos)": violation.durationMinutes,
    "Velocidade Maxima (km/h)": violation.maxSpeed,
    "Ultimo Endereco": violation.address,
  }));
}
