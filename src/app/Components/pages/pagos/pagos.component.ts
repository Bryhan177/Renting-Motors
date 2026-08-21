import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PagosService, PagoManual } from '../../../service/pagos.service';
import { MotosService } from '../../../service/motos.service';
import { Moto } from '../../../shared/interfaces/moto';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-pagos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pagos.component.html',
  styleUrl: './pagos.component.css',
})
export class PagosComponent implements OnInit {
  pagos: PagoManual[] = [];
  motos: Moto[] = [];
  loading = false;
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
  ) {}

  ngOnInit(): void {
    this.cargar();
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

  get totalPagado(): number {
    return this.pagos.reduce((s, p) => s + p.valorPagado, 0);
  }

  get totalGastos(): number {
    return this.pagos.reduce((s, p) => s + p.gastos, 0);
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
        valorPagado: Number(this.form.valorPagado),
        gastos: Number(this.form.gastos) || 0,
        descripcionGasto: this.form.descripcionGasto,
        metodoPago: this.form.metodoPago,
        observaciones: this.form.observaciones,
      })
      .subscribe({
        next: () => {
          this.mostrarModal = false;
          this.cargar();
          Swal.fire({
            icon: 'success',
            title: 'Pago registrado',
            toast: true,
            timer: 1500,
            showConfirmButton: false,
            position: 'top-end',
          });
        },
        error: (e) =>
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e?.message || e?.error?.message || '',
          }),
      });
  }
}
