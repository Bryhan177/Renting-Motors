import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PagosService, PagoManual } from '../../../service/pagos.service';
import { MotosService } from '../../../service/motos.service';
import { CobrosService, Abono } from '../../../service/cobros.service';
import { Moto } from '../../../shared/interfaces/moto';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './pagos.component.html',
  styleUrl: './pagos.component.css',
})
export class PagosComponent implements OnInit {
  pagos: PagoManual[] = [];
  abonosPendientes: Abono[] = [];
  motos: Moto[] = [];
  loading = false;
  loadingAbonos = false;
  mostrarModal = false;

  form = {
    motoId: '',
    fechaPago: new Date().toISOString().slice(0, 10),
    valorPagado: 0,
    gastos: 0,
    descripcionGasto: '',
    metodoPago: 'TRANSFERENCIA',
    observaciones: '',
  };

  constructor(
    private pagosService: PagosService,
    private motosService: MotosService,
    private cobrosService: CobrosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.cargarAbonosPendientes();
    this.motosService.getMotos().subscribe({ next: (m) => (this.motos = m) });
  }

  cargar(): void {
    this.loading = true;
    this.pagosService.getPagos().subscribe({
      next: (p) => {
        this.pagos = p;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        Swal.fire({
          icon: 'error',
          title: 'No se pudieron cargar pagos',
          text: e?.message || 'Ejecuta el SQL MDD completo',
        });
      },
    });
  }

  cargarAbonosPendientes(): void {
    this.loadingAbonos = true;
    this.cobrosService.getAbonos('pendiente_confirmacion').subscribe({
      next: (list) => {
        this.abonosPendientes = list;
        this.loadingAbonos = false;
      },
      error: () => {
        this.abonosPendientes = [];
        this.loadingAbonos = false;
      },
    });
  }

  get totalPagado(): number {
    return this.pagos.reduce((s, p) => s + p.valorPagado, 0);
  }

  get totalGastos(): number {
    return this.pagos.reduce((s, p) => s + p.gastos, 0);
  }

  conductorNombre(a: Abono): string {
    if (a.conductor) return `${a.conductor.nombre} ${a.conductor.apellido}`.trim();
    return 'Conductor';
  }

  verComprobante(a: Abono): void {
    if (!a.comprobante) {
      Swal.fire({ icon: 'info', title: 'Sin comprobante' });
      return;
    }
    if (a.comprobante.startsWith('data:image') || a.comprobante.startsWith('http')) {
      Swal.fire({
        title: 'Comprobante',
        imageUrl: a.comprobante,
        imageAlt: 'Comprobante',
        width: 560,
        confirmButtonText: 'Cerrar',
      });
      return;
    }
    window.open(a.comprobante, '_blank', 'noopener,noreferrer');
  }

  confirmarAbono(a: Abono): void {
    if (!a._id) return;
    Swal.fire({
      title: '¿Confirmar abono?',
      text: `${this.conductorNombre(a)} · $ ${a.monto.toLocaleString('es-CO')}`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.cobrosService.confirmarAbono(a._id!).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: 'Abono confirmado', timer: 1600, showConfirmButton: false });
          this.cargarAbonosPendientes();
        },
        error: (e) =>
          Swal.fire({
            icon: 'error',
            title: 'No se pudo confirmar',
            text: e?.error?.message || e?.message || '',
          }),
      });
    });
  }

  rechazarAbono(a: Abono): void {
    if (!a._id) return;
    Swal.fire({
      title: 'Rechazar abono',
      input: 'text',
      inputLabel: 'Motivo',
      inputPlaceholder: 'Ej. comprobante ilegible, monto incorrecto...',
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      cancelButtonText: 'Cancelar',
      inputValidator: (v) => (!v?.trim() ? 'Escribe el motivo' : null),
    }).then((r) => {
      if (!r.isConfirmed || !r.value) return;
      this.cobrosService.rechazarAbono(a._id!, String(r.value)).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: 'Abono rechazado', timer: 1600, showConfirmButton: false });
          this.cargarAbonosPendientes();
        },
        error: (e) =>
          Swal.fire({
            icon: 'error',
            title: 'No se pudo rechazar',
            text: e?.error?.message || e?.message || '',
          }),
      });
    });
  }

  motoSeleccionada(): Moto | undefined {
    return this.motos.find((m) => m._id === this.form.motoId);
  }

  abrirModal(): void {
    this.form = {
      motoId: '',
      fechaPago: new Date().toISOString().slice(0, 10),
      valorPagado: 0,
      gastos: 0,
      descripcionGasto: '',
      metodoPago: 'TRANSFERENCIA',
      observaciones: '',
    };
    this.mostrarModal = true;
  }

  onMotoChange(): void {
    const m = this.motoSeleccionada();
    if (m?.precioCobro) this.form.valorPagado = m.precioCobro;
  }

  guardar(): void {
    if (!this.form.motoId || !this.form.valorPagado) {
      Swal.fire({ icon: 'warning', title: 'Elige MDD y valor pagado' });
      return;
    }
    const m = this.motoSeleccionada();
    this.pagosService
      .registrarManual({
        motoId: this.form.motoId,
        conductorId: m?.conductorId || null,
        fechaPago: this.form.fechaPago,
        valorPagado: this.form.valorPagado,
        gastos: this.form.gastos,
        descripcionGasto: this.form.descripcionGasto,
        metodoPago: this.form.metodoPago,
        observaciones: this.form.observaciones,
      })
      .subscribe({
        next: () => {
          this.mostrarModal = false;
          Swal.fire({ icon: 'success', title: 'Pago registrado', timer: 1500, showConfirmButton: false });
          this.cargar();
        },
        error: (e) =>
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e?.message || e?.error?.message || 'No se pudo guardar',
          }),
      });
  }
}
