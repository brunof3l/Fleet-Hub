# Controle de Combustivel

Aplicacao em `Next.js 14` para gestao de abastecimentos com:

- upload da planilha `Infleet - Abastecimentos.xlsx`
- persistencia no `Neon PostgreSQL`
- dashboard com `Recharts`
- geracao de relatorio mensal em Excel com `exceljs`
- envio por e-mail com `Resend`
- limpeza automatica de registros antigos

## Stack

- `Next.js 14.2.33`
- `React 18.3.1`
- `postgres`
- `exceljs`
- `resend`
- `Tailwind CSS`

## Variaveis de Ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DB?sslmode=require
CRON_SECRET=seu-segredo-opcional
RESEND_API_KEY=re_xxxxxxxxx
RESEND_FROM_EMAIL=relatorios@seudominio.com
REPORT_RECIPIENT_EMAIL=voce@empresa.com
```

## Banco de Dados

O projeto espera duas tabelas ja existentes no banco Neon:

- `abastecimentos`
- `relatorios_enviados`

Campos utilizados em `abastecimentos`:

```sql
record_hash text primary key,
occurred_at date,
vehicle_name text,
license_plate text,
vehicle_model text,
supplier_name text,
fuel_type text,
quantity_liters numeric,
unit_price_brl numeric,
total_cost_brl numeric,
distance_or_hours numeric,
autonomy_avg numeric,
source_format text,
source_file_name text,
raw_payload jsonb,
created_at timestamptz default now()
```

Campos utilizados em `relatorios_enviados`:

```sql
report_month text primary key,
period_start date,
period_end date,
file_name text,
status text,
sent_to text,
rows_count integer,
sent_at timestamptz,
error_message text,
created_at timestamptz default now()
```

## Como Rodar

Instale as dependencias:

```bash
npm install
```

Suba o ambiente local:

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Fluxos Principais

### Upload

- envie o arquivo `Infleet - Abastecimentos.xlsx`
- o sistema le as colunas `Data`, `Veiculo`, `Quantidade`, `Valor do litro`, `Custo total` e `Autonomia`
- os dados sao normalizados e gravados no Neon
- duplicados sao ignorados por `record_hash`

### Dashboard

- consome dados direto do Neon
- exibe KPIs, filtros, graficos e tabela detalhada

### Relatorio Mensal

Rota:

```bash
POST /api/jobs/monthly-report
```

Comportamento:

- filtra os dados do mes anterior
- gera um arquivo Excel formatado
- envia por e-mail com Resend
- registra o envio em `relatorios_enviados`
- remove registros com mais de `60` dias

Se `CRON_SECRET` estiver configurado, envie no header:

```bash
x-cron-secret: seu-segredo-opcional
```

### Cleanup Manual

Rota:

```bash
POST /api/jobs/cleanup
```

## Validacao

```bash
npm run lint
npm run build
```

Ambos passam com sucesso na configuracao atual.
