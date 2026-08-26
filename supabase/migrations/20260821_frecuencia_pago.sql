-- Agregar frecuencia de cobro al contrato (semanal / quincenal / mensual)
alter table public.contratos
  add column if not exists frecuencia_pago text not null default 'semanal'
  check (frecuencia_pago in ('semanal', 'quincenal', 'mensual'));

comment on column public.contratos.frecuencia_pago is
  'Periodicidad del cobro: semanal (7d), quincenal (15d), mensual (30d)';

notify pgrst, 'reload schema';
