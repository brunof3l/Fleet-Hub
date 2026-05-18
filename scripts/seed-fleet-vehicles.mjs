import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLicensingMonthByPlate(plate) {
  const lastDigit = Number(String(plate).trim().slice(-1));

  if ([1, 2, 3].includes(lastDigit)) {
    return 6;
  }

  if ([4, 5, 6].includes(lastDigit)) {
    return 7;
  }

  if ([7, 8].includes(lastDigit)) {
    return 8;
  }

  if (lastDigit === 9) {
    return 9;
  }

  return 10;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL nao configurado.");
  }

  const jsonPath = path.join(__dirname, "..", "src", "data", "fleet-vehicles.json");
  const seedVehicles = JSON.parse(await readFile(jsonPath, "utf8"));
  const sql = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await sql`
      create table if not exists frota_veiculos (
        id bigserial primary key,
        placa text not null,
        chassi text not null,
        renavam text not null,
        marca_modelo text not null,
        ano_fabricacao_modelo text not null,
        capacidade_litragem numeric(10,2) not null default 0,
        mes_vencimento_licenciamento smallint not null,
        caminho_crlv_pdf text,
        crlv_nome_arquivo text,
        criado_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now(),
        constraint ck_frota_veiculos_capacidade_litragem check (capacidade_litragem >= 0),
        constraint ck_frota_veiculos_mes_vencimento check (mes_vencimento_licenciamento between 1 and 12)
      )
    `;

    await sql`
      create unique index if not exists ux_frota_veiculos_placa
      on frota_veiculos (placa)
    `;

    await sql`
      create unique index if not exists ux_frota_veiculos_chassi
      on frota_veiculos (chassi)
    `;

    await sql`
      create unique index if not exists ux_frota_veiculos_renavam
      on frota_veiculos (renavam)
    `;

    const existingRows = await sql`
      select placa
      from frota_veiculos
      where placa in ${sql(seedVehicles.map((vehicle) => vehicle.placa))}
    `;
    const existingPlateSet = new Set(existingRows.map((row) => row.placa));

    await sql.begin(async (transaction) => {
      await transaction`
        insert into frota_veiculos ${transaction(
          seedVehicles.map((vehicle) => ({
            placa: vehicle.placa,
            chassi: vehicle.chassi,
            renavam: vehicle.renavam,
            marca_modelo: vehicle.marca_modelo,
            ano_fabricacao_modelo: vehicle.ano_fabricacao_modelo,
            capacidade_litragem: vehicle.capacidade_litragem,
            mes_vencimento_licenciamento: getLicensingMonthByPlate(vehicle.placa),
          })),
          "placa",
          "chassi",
          "renavam",
          "marca_modelo",
          "ano_fabricacao_modelo",
          "capacidade_litragem",
          "mes_vencimento_licenciamento",
        )}
        on conflict (placa) do update
        set
          chassi = excluded.chassi,
          renavam = excluded.renavam,
          marca_modelo = excluded.marca_modelo,
          ano_fabricacao_modelo = excluded.ano_fabricacao_modelo,
          capacidade_litragem = excluded.capacidade_litragem,
          mes_vencimento_licenciamento = excluded.mes_vencimento_licenciamento,
          atualizado_em = now()
      `;
    });

    const insertedCount = seedVehicles.length - existingPlateSet.size;
    const updatedCount = existingPlateSet.size;

    console.log(
      JSON.stringify(
        {
          insertedCount,
          updatedCount,
          totalCount: seedVehicles.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
