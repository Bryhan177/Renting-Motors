import { Usuario } from './usuario';

export interface Pago {
  _id?: string;
  conductorId: string;
  conductor?: Usuario; // Información del conductor (populate)
  semana: string; // Formato: YYYY-WW (ej: 2025-W17)
  monto: number; // Monto en COP
  pagado: boolean; // Si el pago fue realizado
  fechaPago?: Date | null; // Fecha cuando se realizó el pago
  gastos?: number;
  descripcionGasto?: string;
  metodoPago?: string;
  observaciones?: string;
  comprobanteImagen?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Estadisticas {
  totalMotos: number;
  motosAsignadas: number;
  motosDisponibles: number;
  conductoresDisponibles: number;
  totalRecaudadoSemana: number;
  semanaActual: string;
}

export interface CreatePagoPayload {
  conductorId: string;
  semana: string;
  monto: number;
  pagado?: boolean;
  fechaPago?: string;
  gastos?: number;
  descripcionGasto?: string;
  metodoPago?: string;
  observaciones?: string;
  comprobanteImagen?: string;
}
