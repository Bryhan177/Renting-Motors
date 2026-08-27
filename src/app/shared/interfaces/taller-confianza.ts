import { stripClienteEmpresaId } from '../empresa-scope';

export interface TallerConfianza {
  _id?: string;
  nombre: string;
  direccion: string;
  telefono: string;
  latitud: number;
  longitud: number;
  horario: string;
  servicios: string;
  activo: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CreateTallerPayload = Omit<TallerConfianza, '_id' | 'createdAt' | 'updatedAt'>;

export function mapTallerFromRow(row: any): TallerConfianza {
  return {
    _id: row.id,
    nombre: row.nombre || '',
    direccion: row.direccion || '',
    telefono: row.telefono || '',
    latitud: Number(row.latitud),
    longitud: Number(row.longitud),
    horario: row.horario || '',
    servicios: row.servicios || '',
    activo: row.activo !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function tallerToDb(taller: Partial<CreateTallerPayload>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (taller.nombre !== undefined) payload['nombre'] = taller.nombre.trim();
  if (taller.direccion !== undefined) payload['direccion'] = taller.direccion.trim();
  if (taller.telefono !== undefined) payload['telefono'] = taller.telefono.trim();
  if (taller.latitud !== undefined) payload['latitud'] = Number(taller.latitud);
  if (taller.longitud !== undefined) payload['longitud'] = Number(taller.longitud);
  if (taller.horario !== undefined) payload['horario'] = taller.horario.trim();
  if (taller.servicios !== undefined) payload['servicios'] = taller.servicios.trim();
  if (taller.activo !== undefined) payload['activo'] = !!taller.activo;
  return stripClienteEmpresaId(payload);
}

export function serviciosLista(servicios: string): string[] {
  return (servicios || '')
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
