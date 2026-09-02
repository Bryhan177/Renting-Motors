import { Usuario } from './usuario';

export type ModalidadMdd = 'arriendo' | 'liquidacion';

/** Excel ESTADO: PERSONAL vs ACTIVA/INACTIVA (flota de arriendo). */
export type UsoMoto = 'flota' | 'personal';

export interface Moto {
  _id?: string;
  /** Alias de negocio: Máquina de Dinero */
  codigo?: string;
  marca: string;
  modelo: string;
  placa: string;
  /** Valor de compra / lo que valió la moto */
  precio: number;
  precioCompra?: number;
  /** Cuánto se le cobra al conductor (cuota) */
  precioCobro?: number;
  soat?: string | null;
  tecnomecanica?: string | null;
  aceite?: string | null;
  transitoMatricula?: string | null;
  fechaIngreso?: string | null;
  picoYPlaca?: string | null;
  cilindraje?: number | null;
  color?: string | null;
  anio?: number | null;
  tieneMultas?: boolean;
  /** flota = catálogo público. personal = no sale en la landing. null = flota. */
  uso?: UsoMoto | null;
  modalidad?: ModalidadMdd;
  estado: 'disponible' | 'en_uso' | 'en_mantenimiento' | 'fuera_servicio';
  conductorId?: string | null;
  conductor?: Usuario;
  /** Foto de listas: URL http de `motos.imagen_url`. Nunca un data:. */
  imagen?: string;
  imagenUrl?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}
