alter table frota_veiculos
  add column if not exists local text;

alter table frota_veiculos
  add column if not exists tem_seguro text;
