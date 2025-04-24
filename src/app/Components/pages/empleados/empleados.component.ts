import { Component } from '@angular/core';
import { Empleado } from '../../../shared/interfaces/empleados';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-empleados',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './empleados.component.html',
  styleUrl: './empleados.component.css',
})
export class EmpleadosComponent {
  mostrarModal: boolean = false;
  empleadoEditando: Empleado | null = null;
  modoEdicion = false;
  empleadoSeleccionado: Empleado | null = null;
  mostrarPagos = false;

  empleados: Empleado[] = [
    {
      nombre: 'Jhon Perez',
      cedula: '123456789',
      telefono: '3001234567',
      moto: 'ABC123',
      descanso: 'Miércoles',
    },
    {
      nombre: 'Carlos Manuel',
      cedula: '123456789',
      telefono: '3001234567',
      moto: 'ABC123',
      descanso: 'Viernes',
    },
    {
      nombre: 'Fredy Arroyabe',
      cedula: '123456789',
      telefono: '3001234567',
      moto: 'ABC123',
      descanso: 'Lunes',
    },
    {
      nombre: 'Rafael Rojas',
      cedula: '123456789',
      telefono: '3001234567',
      moto: 'ABC123',
      descanso: 'Miércoles',
    },
  ];

  nuevoEmpleado: Empleado = {
    nombre: '',
    cedula: '',
    telefono: '',
    moto: '',
    descanso: '',
  };

  editarEmpleado(empleado: Empleado) {
    this.empleadoEditando = { ...empleado };
    this.nuevoEmpleado = { ...empleado };
    this.modoEdicion = true;
    this.mostrarModal = true;
  }
  agregarEmpleado() {
    if (this.modoEdicion && this.empleadoEditando) {
      const index = this.empleados.findIndex(
        (e) => e.cedula === this.empleadoEditando!.cedula
      );
      if (index !== -1) {
        this.empleados[index] = { ...this.nuevoEmpleado };
      }
    } else {
      this.empleados.push({ ...this.nuevoEmpleado });
    }
    this.cerrarModal();
  }

  abrirPagos(empleado: Empleado) {
    this.empleadoSeleccionado = empleado;
    this.mostrarPagos = true;

    // Asegúrate de que tiene historial de pagos
    if (!empleado.pagos) {
      empleado.pagos = [];
    }
  }

  registrarPago() {
    const semanaActual = this.obtenerSemanaActual();
    const yaRegistrado = this.empleadoSeleccionado?.pagos?.some(p => p.semana === semanaActual);

    if (!yaRegistrado && this.empleadoSeleccionado) {
      this.empleadoSeleccionado.pagos!.push({
        semana: semanaActual,
        monto: 220000,
        pagado: true
      });
    }
  }

  cerrarPagos() {
    this.empleadoSeleccionado = null;
    this.mostrarPagos = false;
  }

  obtenerSemanaActual(): string {
    const now = new Date();
    const primera = new Date(now.getFullYear(), 0, 1);
    const dias = Math.floor((now.getTime() - primera.getTime()) / (24 * 60 * 60 * 1000));
    const semana = Math.ceil((dias + primera.getDay() + 1) / 7);
    return `${now.getFullYear()} - Semana:${semana.toString().padStart(2, '0')}`;
  }

  getResumenSemanal() {
    const semanaActual = this.obtenerSemanaActual();
    return this.empleados.map(empleado => {
      const pago = empleado.pagos?.find(p => p.semana === semanaActual);
      return {
        nombre: empleado.nombre,
        cedula: empleado.cedula,
        descanso: empleado.descanso,
        pagado: pago?.pagado ?? false,
        monto: pago?.monto ?? 0
      };
    });
  }


  abrirModal() {
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.nuevoEmpleado = {
      nombre: '',
      cedula: '',
      telefono: '',
      moto: '',
      descanso: '',
    };
    this.modoEdicion = false;
    this.empleadoEditando = null;
  }
}
