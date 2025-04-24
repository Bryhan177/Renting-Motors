export interface Empleado {
  nombre: string;
  cedula: string;
  telefono: string;
  moto: string;
  descanso: string;
  pagos?: PagoSemana[];
}

export interface PagoSemana {
  semana: string; // Ej: '2025-W16'
  monto: number;
  pagado: boolean;
}
