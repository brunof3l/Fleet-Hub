import type { InfleetFuelling } from "@/types/fuel";

const DEFAULT_API_URL = "https://api.infleet.com.br/v1/graphql";
const PAGE_SIZE = 200;
const MAX_PAGES = 100;

const brDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

type GraphQLFuelling = {
  id: string;
  occurredAt: string;
  amount: number | null;
  cost: string | number | null;
  unitPrice: string | number | null;
  fuelType: string | null;
  vehicle: { plate: string | null; displayName: string | null } | null;
  provider: { name: string | null } | null;
};

const LIST_FUELLINGS_QUERY = `
  query ConferenceFuellings($filter: ListFuellingsFilterInput!, $limit: Int!, $offset: Int!) {
    listFuellings(filter: $filter, limit: $limit, offset: $offset) {
      id
      occurredAt
      amount
      cost
      unitPrice
      fuelType
      vehicle {
        plate
        displayName
      }
      provider {
        name
      }
    }
  }
`;

function getApiUrl(): string {
  return process.env.INFLEET_API_URL?.trim() || DEFAULT_API_URL;
}

function getApiToken(): string {
  const token = process.env.INFLEET_API_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "INFLEET_API_TOKEN nao configurado. Defina a chave da API do Infleet para conferir as faturas.",
    );
  }
  return token;
}

export function hasInfleetConfig(): boolean {
  return Boolean(process.env.INFLEET_API_TOKEN?.trim());
}

function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Converts an Infleet UTC timestamp to the calendar date (yyyy-mm-dd) in Brazil. */
function toBrazilDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return brDateFormatter.format(date);
}

function mapFuelling(raw: GraphQLFuelling): InfleetFuelling {
  const rawPlate = String(raw.vehicle?.plate ?? "").trim();

  return {
    id: raw.id,
    occurredAt: raw.occurredAt,
    date: toBrazilDate(raw.occurredAt),
    rawPlate,
    plate: normalizePlate(rawPlate),
    vehicleName: raw.vehicle?.displayName?.trim() || rawPlate || "Veiculo nao identificado",
    liters: toNumber(raw.amount),
    cost: toNumber(raw.cost),
    unitPrice: toNumber(raw.unitPrice),
    fuelType: raw.fuelType ?? "",
    supplier: raw.provider?.name?.trim() || "",
  };
}

async function requestFuellings(
  startAt: string,
  endAt: string,
  offset: number,
): Promise<GraphQLFuelling[]> {
  const response = await fetch(getApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiToken()}`,
    },
    body: JSON.stringify({
      query: LIST_FUELLINGS_QUERY,
      variables: {
        filter: { occurredAt: { startAt, endAt } },
        limit: PAGE_SIZE,
        offset,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Falha ao consultar a API do Infleet (HTTP ${response.status}). ${body.slice(0, 200)}`.trim(),
    );
  }

  const payload = (await response.json()) as {
    data?: { listFuellings?: GraphQLFuelling[] };
    errors?: Array<{ message: string }>;
  };

  if (payload.errors?.length) {
    throw new Error(`API do Infleet retornou erro: ${payload.errors.map((error) => error.message).join("; ")}`);
  }

  return payload.data?.listFuellings ?? [];
}

/**
 * Fetches every fuelling registered in Infleet between two calendar dates
 * (inclusive), paginating through the GraphQL API. Dates are interpreted in
 * Brazil time (UTC-3) to align with how the posto invoices are issued.
 */
export async function fetchInfleetFuellings(
  startDate: string,
  endDate: string,
): Promise<InfleetFuelling[]> {
  const startAt = `${startDate}T00:00:00.000-03:00`;
  const endAt = `${endDate}T23:59:59.999-03:00`;

  const fuellings: InfleetFuelling[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await requestFuellings(startAt, endAt, page * PAGE_SIZE);
    batch.forEach((item) => fuellings.push(mapFuelling(item)));

    if (batch.length < PAGE_SIZE) {
      break;
    }
  }

  return fuellings;
}
