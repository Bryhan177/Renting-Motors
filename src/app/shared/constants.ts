/**
 * Cuotas por defecto de contratos NUEVOS / formularios.
 * Los contratos existentes conservan `cuota_semanal`; no se reescriben cobros.
 * El personal puede poner otra cuota en cada contrato.
 */
export const CUOTAS_ESTANDAR = {
  semanal: 160_000,
  quincenal: 320_000,
  mensual: 640_000,
} as const;

export const CUOTA_SEMANAL_ESTANDAR = CUOTAS_ESTANDAR.semanal;
export const CUOTA_QUINCENAL_ESTANDAR = CUOTAS_ESTANDAR.quincenal;
export const CUOTA_MENSUAL_ESTANDAR = CUOTAS_ESTANDAR.mensual;

export const DEPOSITO_ESTANDAR = 300_000;

/** Número de WhatsApp GoRenting (código país + celular, sin + ni espacios). */
export const WHATSAPP_NUMERO = '573215962216';

export const WHATSAPP_MENSAJE_DEFAULT =
  'Hola GoRenting, quiero información sobre el arriendo de motos.';

export const ACCESORIOS_SUGERIDOS = [
  'Casco',
  '2 llaves',
  'Candado',
  'Kit de herramientas',
  'Chaleco reflectivo',
];

export const DOCUMENTOS_SUGERIDOS = [
  'SOAT',
  'Tecnomecánica',
  'Tarjeta de propiedad',
  'Licencia del conductor',
];
