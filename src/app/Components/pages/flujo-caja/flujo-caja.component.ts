import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CajaService, MovimientoCaja, ResumenBanco, BancoCaja } from '../../../service/caja.service';
import { MotosService } from '../../../service/motos.service';
import { Moto } from '../../../shared/interfaces/moto';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-flujo-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './flujo-caja.component.html',
})
export class FlujoCajaComponent implements OnInit {
  resumen: ResumenBanco[] = [];
  movimientos: MovimientoCaja[] = [];
  motos: Moto[] = [];
  filtroBanco: '' | BancoCaja = '';
  mostrarModal = false;
  form = {
    banco: 'mdd' as BancoCaja,
    tipo: 'ingreso' as 'ingreso' | 'egreso',
    monto: 0,
    fecha: new Date().toISOString().slice(0, 10),
    descripcion: '',
    motoId: '' as string | null,
  };

  constructor(
    private caja: CajaService,
    private motosService: MotosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.motosService.getMotos().subscribe({ next: (m) => (this.motos = m) });
  }

  cargar(): void {
    this.caja.resumen().subscribe({ next: (r) => (this.resumen = r) });
    this.caja.list(this.filtroBanco || undefined).subscribe({
      next: (m) => (this.movimientos = m),
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }

  labelBanco(b: string): string {
    return b === 'ahorro_mdd' ? 'Ahorro MDD' : 'MDD';
  }

  bancoResumen(b: BancoCaja): ResumenBanco | undefined {
    return this.resumen.find((r) => r.banco === b);
  }

  abrir(): void {
    this.form = {
      banco: 'mdd',
      tipo: 'ingreso',
      monto: 0,
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: '',
      motoId: null,
    };
    this.mostrarModal = true;
  }

  guardar(): void {
    if (!this.form.monto || !this.form.descripcion.trim()) {
      Swal.fire({ icon: 'warning', title: 'Monto y descripción requeridos' });
      return;
    }
    this.caja
      .registrar({
        ...this.form,
        motoId: this.form.motoId || null,
      })
      .subscribe({
        next: () => {
          this.mostrarModal = false;
          this.cargar();
          Swal.fire({ icon: 'success', title: 'Movimiento registrado', toast: true, timer: 1400, showConfirmButton: false, position: 'top-end' });
        },
        error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
      });
  }
}
