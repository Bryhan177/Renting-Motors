import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MantenimientosService, Mantenimiento } from '../../../service/mantenimientos.service';
import { MotosService } from '../../../service/motos.service';
import { Moto } from '../../../shared/interfaces/moto';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-mantenimientos',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './mantenimientos.component.html',
})
export class MantenimientosComponent implements OnInit {
  lista: Mantenimiento[] = [];
  motos: Moto[] = [];
  mostrarModal = false;
  form = {
    motoId: '',
    valor: 0,
    fechaIngreso: new Date().toISOString().slice(0, 10),
    observacion: '',
    tipo: 'cambio_aceite',
  };

  constructor(
    private mantService: MantenimientosService,
    private motosService: MotosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.motosService.getMotosLista().subscribe({ next: (m) => (this.motos = m) });
  }

  cargar(): void {
    this.mantService.list().subscribe({
      next: (l) => (this.lista = l),
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error al cargar' }),
    });
  }

  abrir(): void {
    this.form = {
      motoId: '',
      valor: 0,
      fechaIngreso: new Date().toISOString().slice(0, 10),
      observacion: '',
      tipo: 'cambio_aceite',
    };
    this.mostrarModal = true;
  }

  guardar(): void {
    if (!this.form.motoId || !this.form.observacion.trim()) {
      Swal.fire({ icon: 'warning', title: 'MDD y observación son obligatorios' });
      return;
    }
    this.mantService.registrar(this.form).subscribe({
      next: () => {
        this.mostrarModal = false;
        this.cargar();
        this.motosService.getMotosLista().subscribe({ next: (m) => (this.motos = m) });
        Swal.fire({ icon: 'success', title: 'MDD en mantenimiento', toast: true, timer: 1500, showConfirmButton: false, position: 'top-end' });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }

  finalizar(m: Mantenimiento): void {
    if (!m._id) return;
    this.mantService.finalizar(m._id, m.motoId).subscribe({
      next: () => {
        this.cargar();
        Swal.fire({ icon: 'success', title: 'Mantenimiento finalizado', toast: true, timer: 1400, showConfirmButton: false, position: 'top-end' });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }
}
