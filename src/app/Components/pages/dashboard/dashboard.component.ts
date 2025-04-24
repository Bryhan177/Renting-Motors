import { Component } from '@angular/core';
import { Empleado } from '../../../shared/interfaces/empleados';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent {
  empleados: Empleado[] = [
    {
      nombre: 'Jhon Perez', cedula: '123456789', telefono: '3001234567',
      moto: 'ABC123', descanso: 'Miércoles', pagos: [
        { semana: '2025-W17', monto: 220000, pagado: true }
      ]
    },
    {
      nombre: 'Carlos Manuel', cedula: '987654321', telefono: '3009876543',
      moto: 'XYZ456', descanso: 'Viernes', pagos: []
    },
  ];

  semanaActual = this.obtenerSemanaActual();
  motosOperativas = this.empleados.length;
  totalRecaudado = this.calcularTotalRecaudado();
  empleadosPendientes = this.obtenerPendientes();

  obtenerSemanaActual(): string {
    const date = new Date();
    const inicio = new Date(date.getFullYear(), 0, 1);
    const dias = Math.floor((date.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000));
    const semana = Math.ceil((dias + inicio.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${semana.toString().padStart(2, '0')}`;
  }

  calcularTotalRecaudado(): number {
    let total = 0;
    this.empleados.forEach(emp => {
      emp.pagos?.forEach(p => {
        if (p.semana === this.semanaActual && p.pagado) {
          total += p.monto;
        }
      });
    });
    return total;
  }

  obtenerPendientes(): Empleado[] {
    return this.empleados.filter(emp =>
      !emp.pagos?.some(p => p.semana === this.semanaActual && p.pagado)
    );
  }
}
