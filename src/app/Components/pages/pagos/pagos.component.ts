import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PagosService } from '../../../service/pagos.service';
import { MotosService } from '../../../service/motos.service';
import { Pago } from '../../../shared/interfaces/pago';
import { Usuario } from '../../../shared/interfaces/usuario';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pagos.component.html',
  styleUrl: './pagos.component.css'
})
export class PagosComponent implements OnInit {
  pagos: Pago[] = [];
  conductores: Usuario[] = [];
  semanaSeleccionada: string = this.obtenerSemanaActual();
  loading = false;
  
  // Custom Payment Modal
  mostrarModalPago = false;
  pagoSeleccionado: Pago | null = null;
  datosPago = {
    monto: 0,
    gastos: 0,
    descripcionGasto: '',
    metodoPago: 'TRANSFERENCIA',
    observaciones: ''
  };

  constructor(
    private pagosService: PagosService,
    private motosService: MotosService
  ) {}

  ngOnInit(): void {
    this.loadPagos();
  }

  loadPagos(): void {
    this.loading = true;
    this.pagosService.getPagosBySemana(this.semanaSeleccionada).subscribe({
      next: (pagos) => {
        this.pagos = pagos;
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando pagos:', error);
        this.loading = false;
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudieron cargar los pagos'
        });
      }
    });
  }

  cambiarSemana(): void {
    this.loadPagos();
  }

  abrirModalPago(pago: Pago): void {
    this.pagoSeleccionado = pago;
    this.datosPago = {
      monto: pago.monto,
      gastos: 0,
      descripcionGasto: '',
      metodoPago: 'TRANSFERENCIA',
      observaciones: ''
    };
    this.mostrarModalPago = true;
  }

  cerrarModalPago(): void {
    this.mostrarModalPago = false;
    this.pagoSeleccionado = null;
  }

  confirmarPago(): void {
    if (!this.pagoSeleccionado) return;

    if (this.datosPago.gastos > 0 && !this.datosPago.descripcionGasto) {
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Debe ingresar la descripción del gasto',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
      });
      return;
    }

    const payload: Partial<Pago> = {
      monto: this.datosPago.monto,
      gastos: this.datosPago.gastos,
      descripcionGasto: this.datosPago.descripcionGasto,
      metodoPago: this.datosPago.metodoPago,
      observaciones: this.datosPago.observaciones,
      pagado: true,
      fechaPago: new Date()
    };

    this.pagosService.updatePago(this.pagoSeleccionado._id!, payload).subscribe({
      next: (pagoActualizado) => {
        const index = this.pagos.findIndex(p => p._id === pagoActualizado._id);
        if (index !== -1) {
          this.pagos[index] = pagoActualizado;
        }
        Swal.fire({
          icon: 'success',
          title: 'Pago registrado con éxito',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        this.cerrarModalPago();
      },
      error: (error) => {
        console.error('Error registrando pago:', error);
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: 'No se pudo registrar el pago',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
      }
    });
  }

  generarPagosSemanales(): void {
    Swal.fire({
      title: '¿Generar pagos semanales?',
      text: `¿Generar los pagos correspondientes para la semana ${this.semanaSeleccionada}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#007bff',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, generar pagos',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.motosService.generarPagosSemanales(this.semanaSeleccionada).subscribe({
          next: (pagosGenerados) => {
            Swal.fire({
              icon: 'success',
              title: 'Pagos generados',
              text: `Se generaron ${pagosGenerados.length} pagos para la semana ${this.semanaSeleccionada}`,
              timer: 3000,
              showConfirmButton: false
            });
            this.loadPagos(); // Recargar la lista
          },
          error: (error) => {
            console.error('Error generando pagos:', error);
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: 'No se pudieron generar los pagos'
            });
          }
        });
      }
    });
  }

  obtenerSemanaActual(): string {
    const date = new Date();
    const inicio = new Date(date.getFullYear(), 0, 1);
    const dias = Math.floor((date.getTime() - inicio.getTime()) / (24 * 60 * 60 * 1000));
    const semana = Math.ceil((dias + inicio.getDay() + 1) / 7);
    return `${date.getFullYear()}-W${semana.toString().padStart(2, '0')}`;
  }

  getTotalPagado(): number {
    return this.pagos
      .filter(pago => pago.pagado)
      .reduce((total, pago) => total + pago.monto, 0);
  }

  getTotalPendiente(): number {
    return this.pagos
      .filter(pago => !pago.pagado)
      .reduce((total, pago) => total + pago.monto, 0);
  }

  getPagosPagados(): Pago[] {
    return this.pagos.filter(pago => pago.pagado);
  }

  getPagosPendientes(): Pago[] {
    return this.pagos.filter(pago => !pago.pagado);
  }
}
