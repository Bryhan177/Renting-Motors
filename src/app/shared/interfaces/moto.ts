export interface Moto {
  placa: string;
  modelo: string;
  anio: number;
  soat: string; // formato fecha ISO
  tecnomecanica: string;
  estado: 'Activa' | 'En mantenimiento' | 'Inactiva';
}

