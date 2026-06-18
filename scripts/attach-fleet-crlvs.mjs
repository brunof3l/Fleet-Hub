import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { put } from "@vercel/blob";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_CRLV_DIR = "C:/Users/T.I/Documents/CRLV - 2025";

function loadEnvLocal() {
  // Lightweight .env.local loader with quote stripping so the script can be run
  // with a plain `node scripts/...` without extra tooling.
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
    // If .env.local is absent we fall back to the ambient environment.
  }
}

function parseArgs(argv) {
  const args = { dir: DEFAULT_CRLV_DIR, dryRun: false, force: false, createMissing: false };
  for (const arg of argv) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--create-missing") args.createMissing = true;
    else if (arg.startsWith("--dir=")) args.dir = arg.slice("--dir=".length);
  }
  return args;
}

function getLicensingMonthByPlate(plate) {
  const lastDigit = Number(String(plate).trim().slice(-1));
  if ([1, 2, 3].includes(lastDigit)) return 6;
  if ([4, 5, 6].includes(lastDigit)) return 7;
  if ([7, 8].includes(lastDigit)) return 8;
  if (lastDigit === 9) return 9;
  return 10;
}

function plateFromFileName(fileName) {
  const base = fileName.replace(/\.[^.]+$/, "");
  // Filenames look like "ABC1D23 - 2025.pdf" or "ABC1D23_2025.pdf".
  const firstToken = base.split(/[\s_]/)[0] ?? "";
  return firstToken.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isValidPlate(plate) {
  return /^[A-Z0-9]{7}$/.test(plate);
}

function sanitizeFileName(fileName) {
  const trimmed = String(fileName ?? "").trim();
  const extensionMatch = trimmed.match(/(\.[a-zA-Z0-9]+)$/);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? ".pdf";
  const baseName = trimmed.replace(/(\.[a-zA-Z0-9]+)$/, "").replace(/[^a-zA-Z0-9-_]+/g, "-");
  const safeBaseName = baseName.replace(/-+/g, "-").replace(/^-|-$/g, "") || "crlv";
  return `${safeBaseName}${extension}`;
}

function buildBlobPath(plate, originalFileName) {
  const safeFileName = sanitizeFileName(originalFileName);
  const safePlate = plate.replace(/[^A-Z0-9-]+/g, "");
  return `fleet/crlv/${safePlate}/${Date.now()}-${safeFileName}`;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL nao configurado.");
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!args.dryRun && !blobToken) {
    throw new Error("BLOB_READ_WRITE_TOKEN nao configurado.");
  }

  const entries = await readdir(args.dir, { withFileTypes: true });
  const pdfFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort();
  const nonPdfFiles = entries
    .filter((entry) => entry.isFile() && !entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name);

  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    const vehicles = await sql`
      select id, placa, caminho_crlv_pdf, crlv_nome_arquivo
      from frota_veiculos
    `;
    const byPlate = new Map(vehicles.map((v) => [String(v.placa).toUpperCase(), v]));

    const matched = [];
    const unmatched = [];
    const invalid = [];

    for (const fileName of pdfFiles) {
      const plate = plateFromFileName(fileName);
      if (!isValidPlate(plate)) {
        invalid.push({ fileName, plate });
        continue;
      }
      const vehicle = byPlate.get(plate);
      if (!vehicle) {
        unmatched.push({ fileName, plate });
        continue;
      }
      matched.push({ fileName, plate, vehicle });
    }

    console.log("==================== RELATORIO DE CARGA DE CRLVs ====================");
    console.log(`Diretorio: ${args.dir}`);
    console.log(`Veiculos no banco: ${vehicles.length}`);
    console.log(`PDFs encontrados: ${pdfFiles.length}`);
    console.log(`  -> Casados com placa: ${matched.length}`);
    console.log(`  -> Sem veiculo correspondente: ${unmatched.length}`);
    console.log(`  -> Nome de arquivo invalido: ${invalid.length}`);
    if (nonPdfFiles.length) {
      console.log(`Arquivos nao-PDF ignorados (${nonPdfFiles.length}): ${nonPdfFiles.join(", ")}`);
    }

    if (unmatched.length) {
      const fate = args.createMissing
        ? "serao cadastrados (chassi/renavam provisorios) e anexados"
        : "NAO serao anexados (use --create-missing para cadastrar)";
      console.log(`\n--- SEM VEICULO NO BANCO (${fate}) ---`);
      unmatched.forEach((item) => console.log(`  ${item.plate}  (${item.fileName})`));
    }
    if (invalid.length) {
      console.log("\n--- NOME INVALIDO (placa nao identificada) ---");
      invalid.forEach((item) => console.log(`  ${item.fileName}  -> "${item.plate}"`));
    }

    const alreadyHave = matched.filter((item) => item.vehicle.caminho_crlv_pdf);
    if (alreadyHave.length && !args.force) {
      console.log(
        `\nNota: ${alreadyHave.length} veiculos casados ja possuem CRLV e serao ignorados (use --force para substituir).`,
      );
    }

    if (args.dryRun) {
      console.log("\n[DRY-RUN] Nenhuma gravacao realizada.");
      return;
    }

    // Optionally register vehicles that have a CRLV file but no record yet,
    // mirroring the placeholder strategy used by the spreadsheet import.
    if (args.createMissing && unmatched.length) {
      console.log(`\nCadastrando ${unmatched.length} veiculos faltantes...`);
      for (const item of unmatched) {
        const [created] = await sql`
          insert into frota_veiculos (
            placa, chassi, renavam, marca_modelo, ano_fabricacao_modelo,
            capacidade_litragem, mes_vencimento_licenciamento
          ) values (
            ${item.plate},
            ${`CHASSI-PENDENTE-${item.plate}`},
            ${`RENAVAM-PENDENTE-${item.plate}`},
            ${"NAO INFORMADO"},
            ${"NAO INFORMADO"},
            ${0},
            ${getLicensingMonthByPlate(item.plate)}
          )
          on conflict (placa) do update set atualizado_em = now()
          returning id, placa, caminho_crlv_pdf, crlv_nome_arquivo
        `;
        matched.push({ fileName: item.fileName, plate: item.plate, vehicle: created });
      }
    }

    const toUpload = args.force ? matched : matched.filter((item) => !item.vehicle.caminho_crlv_pdf);
    console.log(`\nIniciando upload de ${toUpload.length} documentos...\n`);

    let ok = 0;
    let fail = 0;
    for (const item of toUpload) {
      try {
        const fileBuffer = await readFile(path.join(args.dir, item.fileName));
        const blob = await put(buildBlobPath(item.plate, item.fileName), fileBuffer, {
          access: "private",
          contentType: "application/pdf",
          addRandomSuffix: false,
          token: blobToken,
        });
        await sql`
          update frota_veiculos
          set caminho_crlv_pdf = ${blob.url},
              crlv_nome_arquivo = ${item.fileName},
              atualizado_em = now()
          where id = ${item.vehicle.id}
        `;
        ok += 1;
        console.log(`  OK   ${item.plate}  <- ${item.fileName}`);
      } catch (error) {
        fail += 1;
        console.log(`  FALHA ${item.plate}  (${item.fileName}): ${error instanceof Error ? error.message : error}`);
      }
    }

    console.log(`\n==================== CONCLUIDO ====================`);
    console.log(`Anexados com sucesso: ${ok}`);
    console.log(`Falhas: ${fail}`);
    console.log(`Ignorados (ja tinham CRLV): ${matched.length - toUpload.length}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
