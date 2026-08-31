import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, switchMap } from 'rxjs/operators';
import { PagosService, PagoManual } from '../../../service/pagos.service';
import { MotosService } from '../../../service/motos.service';
import { CobrosService, Abono, Cobro } from '../../../service/cobros.service';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import { Moto } from '../../../shared/interfaces/moto';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import { diasHasta } from '../../../shared/date.util';
import { FrecuenciaPago, parseDateOnly } from '../../../shared/periodo.util';
import {
  FiltroCartera,
  GrupoCartera,
  ItemCartera,
  agruparCarteraPorConductor,
  construirCarteraCobros,
  filtrarCartera,
  filtrarCarteraPorConductor,
  opcionesConductorCartera,
} from '../../../shared/cartera-cobros';
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
  contratos: Contrato[] = [];
  cartera: ItemCartera[] = [];
  loading = false;
  loadingAbonos = false;
  loadingCartera = false;
  generandoCobros = false;
  guardandoPagoCobro = false;
  guardandoOtroIngreso = false;
  mostrarModal = false;
  mostrarModalCobro = false;
  filtroCartera: FiltroCartera = 'todos';
  conductorSeleccionadoId = '';
  busquedaConductor = '';

  form = {
    motoId: '' as string | null,
    fechaPago: new Date().toISOString().slice(0, 10),
    valorPagado: 0,
    metodoPago: 'Transferencia',
    observaciones: 'Alquiler puntual',
  };

  cobroPagoForm = {
    cobroId: '',
    conductorNombre: '',
    periodoLabel: '',
    saldo: 0,
    monto: 0,
    metodoPago: 'Transferencia',
    observaciones: '',
    comprobante: null as string | null,
  };

  constructor(
    private pagosService: PagosService,
    private motosService: MotosService,
    private cobrosService: CobrosService,
    private contratosService: ContratosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.cargarAbonosPendientes();
    this.motosService.getMotos().subscribe({ next: (m) => (this.motos = m) });
    this.cargarCartera(true);
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

  /**
   * Genera cobros faltantes y carga la cartera de cuotas.
   * @param auto Si true, genera en silencio al entrar; si false, muestra feedback.
   */
  cargarCartera(auto = false): void {
    this.loadingCartera = true;
    if (!auto) this.generandoCobros = true;

    const generar$ = this.cobrosService.generarPendientes().pipe(
      catchError(() => of([] as Cobro[])),
    );

    generar$
      .pipe(
        switchMap((creados) =>
          forkJoin({
            creados: of(creados),
            cobros: this.cobrosService.getCobros().pipe(catchError(() => of([] as Cobro[]))),
            contratos: this.contratosService.getContratos().pipe(catchError(() => of([] as Contrato[]))),
          }),
        ),
        finalize(() => {
          this.loadingCartera = false;
          this.generandoCobros = false;
        }),
      )
      .subscribe({
        next: ({ creados, cobros, contratos }) => {
          this.contratos = contratos;
          this.cartera = construirCarteraCobros(cobros, contratos, this.motos);
          if (!auto && creados.length) {
            Swal.fire({
              icon: 'success',
              title: 'Cobros actualizados',
              text: `Se generaron ${creados.length} periodo(s) nuevo(s).`,
              timer: 2000,
              showConfirmButton: false,
            });
          } else if (!auto) {
            Swal.fire({
              icon: 'info',
              title: 'Cartera al día',
              text: 'No había periodos nuevos por generar.',
              timer: 1600,
              showConfirmButton: false,
            });
          }
        },
        error: (e) => {
          this.cartera = [];
          if (!auto) {
            Swal.fire({
              icon: 'error',
              title: 'No se pudo cargar la cartera',
              text: e?.message || e?.error?.message || '',
            });
          }
        },
      });
  }

  get carteraFiltrada(): ItemCartera[] {
    const porEstado = filtrarCartera(this.cartera, this.filtroCartera);
    return filtrarCarteraPorConductor(
      porEstado,
      this.conductorSeleccionadoId,
      this.busquedaConductor,
    );
  }

  get gruposCartera(): GrupoCartera[] {
    return agruparCarteraPorConductor(this.carteraFiltrada);
  }

  get conductoresOpciones() {
    return opcionesConductorCartera(this.cartera);
  }

  get totalEnMora(): number {
    return this.cartera.filter((i) => i.cobro.enMora).length;
  }

  get conductoresEnMora(): number {
    return new Set(
      this.cartera.filter((i) => i.cobro.enMora).map((i) => i.conductorId || i.conductorNombre),
    ).size;
  }

  get montoEnMora(): number {
    return this.cartera
      .filter((i) => i.cobro.enMora)
      .reduce((s, i) => s + i.cobro.saldo, 0);
  }

  get totalPendientesCartera(): number {
    return this.cartera.length;
  }

  setFiltroCartera(f: FiltroCartera): void {
    this.filtroCartera = f;
  }

  etiquetaFrecuencia(f: FrecuenciaPago): string {
    switch (f) {
      case 'quincenal':
        return 'Quincenal';
      case 'mensual':
        return 'Mensual';
      default:
        return 'Semanal';
    }
  }

  etiquetaEstadoCobro(item: ItemCartera): string {
    if (item.cobro.enMora) {
      return item.diasMora > 0 ? `En mora (${item.diasMora}d)` : 'En mora';
    }
    const dias = diasHasta(item.cobro.fechaVencimiento);
    if (dias === 0) return 'Vence hoy';
    if (dias !== null && dias > 0 && dias <= 3) return `Vence en ${dias}d`;
    if (item.cobro.estado === 'parcial') return 'Pago parcial';
    return 'Pendiente';
  }

  claseEstadoCobro(item: ItemCartera): string {
    if (item.cobro.enMora) return 'bg-red-500/20 text-red-300';
    const dias = diasHasta(item.cobro.fechaVencimiento);
    if (dias === 0) return 'bg-amber-500/20 text-amber-300';
    if (dias !== null && dias > 0 && dias <= 3) return 'bg-amber-500/15 text-amber-200';
    if (item.cobro.estado === 'parcial') return 'bg-blue-500/15 text-blue-300';
    return 'bg-gray-700 text-gray-300';
  }

  formatearFecha(fecha: string): string {
    const d = parseDateOnly(fecha);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  nombreConductorCobro(c: Cobro): string {
    if (c.conductor) return `${c.conductor.nombre} ${c.conductor.apellido}`.trim();
    return 'Conductor';
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
          this.cargarCartera(true);
          this.cargar();
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

  abrirRegistrarPagoCobro(item: ItemCartera): void {
    if (!item.cobro._id) return;
    this.cobroPagoForm = {
      cobroId: item.cobro._id,
      conductorNombre: item.conductorNombre,
      periodoLabel: `#${item.cobro.numeroPeriodo} · ${this.etiquetaFrecuencia(item.frecuencia)} · vence ${this.formatearFecha(item.cobro.fechaVencimiento)}`,
      saldo: item.cobro.saldo,
      monto: item.cobro.saldo,
      metodoPago: 'Transferencia',
      observaciones: '',
      comprobante: null,
    };
    this.mostrarModalCobro = true;
  }

  cerrarModalCobro(): void {
    this.mostrarModalCobro = false;
  }

  onComprobantePagoCobro(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      Swal.fire({ icon: 'warning', title: 'El comprobante debe pesar máximo 4 MB' });
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.cobroPagoForm.comprobante = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  guardarPagoCobro(): void {
    if (!this.cobroPagoForm.cobroId || !this.cobroPagoForm.monto || this.cobroPagoForm.monto <= 0) {
      Swal.fire({ icon: 'warning', title: 'Indica un monto válido' });
      return;
    }
    this.guardandoPagoCobro = true;
    this.cobrosService
      .registrarAbono({
        cobroId: this.cobroPagoForm.cobroId,
        monto: this.cobroPagoForm.monto,
        metodoPago: this.cobroPagoForm.metodoPago,
        observaciones: this.cobroPagoForm.observaciones || undefined,
        comprobante: this.cobroPagoForm.comprobante || undefined,
        origenAbono: 'admin',
        pendienteConfirmacion: false,
      })
      .subscribe({
        next: () => {
          this.guardandoPagoCobro = false;
          this.mostrarModalCobro = false;
          Swal.fire({
            icon: 'success',
            title: 'Pago registrado',
            text: 'Abono registrado (no pendiente). El cobro y la caja se actualizan.',
            timer: 2000,
            showConfirmButton: false,
          });
          this.cargarCartera(true);
          this.cargarAbonosPendientes();
          this.cargar();
        },
        error: (e) => {
          this.guardandoPagoCobro = false;
          Swal.fire({
            icon: 'error',
            title: 'No se pudo registrar',
            text: e?.error?.message || e?.message || '',
          });
        },
      });
  }

  motoSeleccionada(): Moto | undefined {
    return this.motos.find((m) => m._id === this.form.motoId);
  }

  abrirModal(): void {
    this.form = {
      motoId: null,
      fechaPago: new Date().toISOString().slice(0, 10),
      valorPagado: 0,
      metodoPago: 'Transferencia',
      observaciones: 'Alquiler puntual',
    };
    this.mostrarModal = true;
  }

  guardar(): void {
    if (!this.form.valorPagado || this.form.valorPagado <= 0) {
      Swal.fire({ icon: 'warning', title: 'Indica el valor del ingreso' });
      return;
    }
    this.guardandoOtroIngreso = true;
    const m = this.motoSeleccionada();
    this.pagosService
      .registrarOtroIngreso({
        motoId: this.form.motoId || null,
        conductorId: m?.conductorId || null,
        fechaPago: this.form.fechaPago,
        valorPagado: this.form.valorPagado,
        metodoPago: this.form.metodoPago,
        observaciones: this.form.observaciones || 'Otros ingresos',
      })
      .subscribe({
        next: () => {
          this.guardandoOtroIngreso = false;
          this.mostrarModal = false;
          Swal.fire({
            icon: 'success',
            title: 'Ingreso registrado',
            text: 'Queda en Pagos y Flujo de caja. El dashboard lo suma como otros ingresos (no es cuota).',
            timer: 2200,
            showConfirmButton: false,
          });
          this.cargar();
        },
        error: (e) => {
          this.guardandoOtroIngreso = false;
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: e?.message || e?.error?.message || 'No se pudo guardar',
          });
        },
      });
  }
}
