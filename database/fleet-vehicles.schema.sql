create table if not exists frota_veiculos (
  id bigserial primary key,
  placa text not null,
  chassi text not null,
  renavam text not null,
  marca_modelo text not null,
  ano_fabricacao_modelo text not null,
  capacidade_litragem numeric(10,2) not null default 0,
  local text,
  tem_seguro text,
  mes_vencimento_licenciamento smallint not null,
  caminho_crlv_pdf text,
  crlv_nome_arquivo text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ck_frota_veiculos_capacidade_litragem check (capacidade_litragem >= 0),
  constraint ck_frota_veiculos_mes_vencimento check (mes_vencimento_licenciamento between 1 and 12)
);

create unique index if not exists ux_frota_veiculos_placa
  on frota_veiculos (placa);

create unique index if not exists ux_frota_veiculos_chassi
  on frota_veiculos (chassi);

create unique index if not exists ux_frota_veiculos_renavam
  on frota_veiculos (renavam);
