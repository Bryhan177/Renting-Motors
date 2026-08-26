import { FrecuenciaPago } from '../periodo.util';

export interface Plan {
  _id?: string;
  nombre: string;
  descripcion: string;
  condicionesUso: string;
  periodicidadesPermitidas: FrecuenciaPago[];
  valorSugerido: number;
  permiteNegociacion: boolean;
  duracionMinimaMeses: number;
  requiereCuotaInicial: boolean;
  activo: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type CreatePlanPayload = Omit<Plan, '_id' | 'createdAt' | 'updatedAt'>;
