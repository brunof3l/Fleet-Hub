import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_FILE = "C:/Users/T.I/Desktop/Controle de Veiculos Leituga.xlsx";

function loadEnvLocal() {
  try {
    const txt = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!match) continue;
      let [, key, value] = match;
      value = value.trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // fall back to ambient environment
  }
}

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--file=")) args.file = arg.slice("--file=".length);
  }
  return args;
}

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizePlate(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

function normalizePrefix(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  return normalized || null;
}

function isValidPlate(plate) {
  return /^[A-Z0-9]{7}$/.test(plate);
}

function buildPrefixMap(filePath) {
  const workbook = XLSX.readFile(filePath);
  const map = new Map(); // placa -> prefixo

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: false,
    });

    let plateIndex = -1;
    let prefixIndex = -1;
    let headerRow = -1;

    for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
      const row = rows[i] ?? [];
      const pIdx = row.findIndex((cell) => normalizeHeader(cell) === "placa");
      const xIdx = row.findIndex((cell) => normalizeHeader(cell) === "prefixo");
      if (pIdx >= 0 && xIdx >= 0) {
        plateIndex = pIdx;
        prefixIndex = xIdx;
        headerRow = i;
        break;
      }
    }

    if (headerRow < 0) continue;

    for (const row of rows.slice(headerRow + 1)) {
      const plate = normalizePlate(row[plateIndex]);
      const prefix = normalizePrefix(row[prefixIndex]);
      if (!isValidPlate(plate) || !prefix) continue;
      if (!map.has(plate)) map.set(plate, prefix);
    }
  }

  return map;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL nao configurado.");

  const prefixMap = buildPrefixMap(args.file);

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await sql`alter table frota_veiculos add column if not exists prefixo text`;

    const vehicles = await sql`select id, placa, prefixo from frota_veiculos`;
    const byPlate = new Map(vehicles.map((v) => [normalizePlate(v.placa), v]));

    const toUpdate = [];
    const unchanged = [];
    const noVehicle = [];

    for (const [plate, prefix] of prefixMap.entries()) {
      const vehicle = byPlate.get(plate);
      if (!vehicle) {
        noVehicle.push({ plate, prefix });
        continue;
      }
      if ((vehicle.prefixo ?? null) === prefix) {
        unchanged.push({ plate, prefix });
        continue;
      }
      toUpdate.push({ id: vehicle.id, plate, prefix, old: vehicle.prefixo ?? null });
    }

    console.log("============== IMPORTACAO DE PREFIXOS DA FROTA ==============");
    console.log(`Planilha: ${args.file}`);
    console.log(`Prefixos encontrados na planilha: ${prefixMap.size}`);
    console.log(`Veiculos no banco: ${vehicles.length}`);
    console.log(`  -> A atualizar: ${toUpdate.length}`);
    console.log(`  -> Ja corretos: ${unchanged.length}`);
    console.log(`  -> Sem veiculo no banco: ${noVehicle.length}`);

    if (noVehicle.length) {
      console.log("\n--- PLACAS COM PREFIXO MAS SEM VEICULO NO BANCO ---");
      noVehicle.forEach((item) => console.log(`  ${item.plate}  (${item.prefix})`));
    }

    if (toUpdate.length) {
      console.log("\n--- ATUALIZACOES ---");
      toUpdate.forEach((item) =>
        console.log(`  ${item.plate}: ${item.old ?? "(vazio)"} -> ${item.prefix}`),
      );
    }

    if (args.dryRun) {
      console.log("\n[DRY-RUN] Nenhuma gravacao realizada.");
      return;
    }

    let updated = 0;
    for (const item of toUpdate) {
      await sql`
        update frota_veiculos
        set prefixo = ${item.prefix}, atualizado_em = now()
        where id = ${item.id}
      `;
      updated += 1;
    }

    console.log(`\n============== CONCLUIDO ==============`);
    console.log(`Prefixos atualizados: ${updated}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
