export interface ReferenciaPersonal {
  nombre?: string;
  parentesco?: string;
  telefono?: string;
  direccion?: string;
}

export interface Usuario {
  _id?: string;
  nombre: string;
  apellido: string;
  email: string;
  cedula: number;
  telefono: string;
  edad?: number | null;
  direccion?: string | null;
  uso?: string | null;
  tiempoContrato?: string | null;
  referencia1?: ReferenciaPersonal;
  referencia2?: ReferenciaPersonal;
  rol: 'administrador' | 'asesor' | 'empleado' | 'usuario' | 'conductor';
  activo: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string | boolean;
}

export type CreateUsuarioPayload = Omit<Usuario, '_id' | 'createdAt' | 'updatedAt'> & {
  password?: string;
};
