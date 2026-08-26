-- Agregar categorías tecnomecanica y soat a documentos
alter table public.documentos drop constraint if exists documentos_categoria_check;

alter table public.documentos
  add constraint documentos_categoria_check
  check (categoria in (
    'contrato_plantilla',
    'cc_cliente',
    'licencia',
    'matricula_mdd',
    'formulario',
    'tecnomecanica',
    'soat',
    'otro'
  ));

notify pgrst, 'reload schema';
