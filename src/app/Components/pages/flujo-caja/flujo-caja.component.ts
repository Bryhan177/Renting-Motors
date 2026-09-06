import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BancoCaja,
  BancoCatalogo,
  CajaService,
  MovimientoCaja,
  ResumenBanco,
} from '../../../service/caja.service';
import { MotosService } from '../../../service/motos.service';
import { Moto } from '../../../shared/interfaces/moto';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import { nombreBanco } from '../../../shared/caja-resumen';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-flujo-caja',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './flujo-caja.component.html',
})
export class FlujoCajaComponent implements OnInit {
  bancos: BancoCatalogo[] = [];
  resumen: ResumenBanco[] = [];
  movimientos: MovimientoCaja[] = [];
  motos: Moto[] = [];
  filtroBanco: '' | BancoCaja = '';
  mostrarModal = false;
  mostrarModalBanco = false;
  modoEdicionBanco = false;
  editandoBancoId: string | null = null;
  formBanco = { nombre: '' };
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
    this.motosService.getMotosLista().subscribe({ next: (m) => (this.motos = m) });
  }

  cargar(): void {
    this.caja.listBancos().subscribe({
      next: (bancos) => {
        this.bancos = bancos;
        if (this.filtroBanco && !bancos.some((b) => b.codigo === this.filtroBanco)) {
          this.filtroBanco = '';
        }
        const codes = bancos.map((b) => b.codigo);
        this.caja.resumen(codes).subscribe({ next: (r) => (this.resumen = r) });
        this.caja.list(this.filtroBanco || undefined).subscribe({
          next: (m) => (this.movimientos = m),
          error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
        });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }

  labelBanco(b: string): string {
    return nombreBanco(b, this.bancos);
  }

  bancoResumen(b: BancoCaja): ResumenBanco | undefined {
    return this.resumen.find((r) => r.banco === b);
  }

  bancoPersistido(banco: BancoCatalogo): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(banco.id);
  }

  estiloTarjeta(codigo: string): { border: string; title: string } {
    if (codigo === 'mdd') return { border: 'border-emerald-700/40', title: 'text-emerald-300' };
    if (codigo === 'ahorro_mdd') return { border: 'border-cyan-700/40', title: 'text-cyan-300' };
    return { border: 'border-amber-700/40', title: 'text-amber-300' };
  }

  abrir(): void {
    this.form = {
      banco: this.bancos[0]?.codigo || 'mdd',
      tipo: 'ingreso',
      monto: 0,
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: '',
      motoId: null,
    };
    this.mostrarModal = true;
  }

  abrirCrearBanco(): void {
    this.modoEdicionBanco = false;
    this.editandoBancoId = null;
    this.formBanco = { nombre: '' };
    this.mostrarModalBanco = true;
  }

  abrirEditarBanco(banco: BancoCatalogo): void {
    this.modoEdicionBanco = true;
    this.editandoBancoId = banco.id;
    this.formBanco = { nombre: banco.nombre };
    this.mostrarModalBanco = true;
  }

  guardarBanco(): void {
    const nombre = this.formBanco.nombre.trim();
    if (!nombre) {
      Swal.fire({ icon: 'warning', title: 'El nombre del banco es obligatorio' });
      return;
    }
    const req = this.modoEdicionBanco && this.editandoBancoId
      ? this.caja.actualizarBanco(this.editandoBancoId, { nombre })
      : this.caja.crearBanco({ nombre });
    req.subscribe({
      next: (banco) => {
        this.mostrarModalBanco = false;
        if (!this.modoEdicionBanco) this.filtroBanco = banco.codigo;
        this.cargar();
        Swal.fire({
          icon: 'success',
          title: this.modoEdicionBanco ? 'Banco actualizado' : 'Banco creado',
          toast: true,
          timer: 1400,
          showConfirmButton: false,
          position: 'top-end',
        });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }

  guardar(): void {
    if (!this.form.banco) {
      Swal.fire({ icon: 'warning', title: 'Selecciona un banco' });
      return;
    }
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
