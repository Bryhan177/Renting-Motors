import { Component } from '@angular/core';
import { Empleado, PagoSemana } from '../../../shared/interfaces/empleados';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pagos.component.html',
  styleUrl: './pagos.component.css'
})
export class PagosComponent {
  empleados: Empleado[] = [
    { nombre: 'Jhon Perez', cedula: '123456789', telefono: '3001234567', moto: 'ABC123', descanso: 'Miércoles', pagos: [] },
    { nombre: 'Carlos Manuel', cedula: '987654321', telefono: '3009876543', moto: 'XYZ456', descanso: 'Viernes', pagos: [] },
  ];

  semanaSeleccionada: string = this.obtenerSemanaActual();

  obtenerSemanaActual(): string {
    const date = new Date();
    return `${date.getFullYear()}-W${this.obtenerNumeroSemana(date)}`;
  }

  obtenerNumeroSemana(date: Date): string {
    const primera = new Date(date.getFullYear(), 0, 1);
    const dias = Math.floor((date.getTime() - primera.getTime()) / (24 * 60 * 60 * 1000));
    const semana = Math.ceil((dias + primera.getDay() + 1) / 7);
    return semana.toString().padStart(2, '0');
  }

  yaPago(empleado: Empleado): any {
    return empleado.pagos?.some(p => p.semana === this.semanaSeleccionada && p.pagado);
  }

  registrarPago(empleado: Empleado) {
    if (!empleado.pagos) empleado.pagos = [];
    empleado.pagos.push({
      semana: this.semanaSeleccionada,
      monto: 220000,
      pagado: true
    });
  }
}
