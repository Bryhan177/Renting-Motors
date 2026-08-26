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
import { diasHasta, etiquetaVencimiento } from '../../../shared/date.util';
import { FrecuenciaPago, cobroPeriodoVigente, parseDateOnly } from '../../../shared/periodo.util';
import Swal from 'sweetalert2';

type FiltroCartera = 'todos' | 'mora' | 'pendientes' | 'al_dia';

interface ItemCartera {
  cobro: Cobro;
  frecuencia: FrecuenciaPago;
  conductorNombre: string;
  motoPlaca: string;
  diasMora: number;
}

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
  mostrarModal = false;
  mostrarModalCobro = false;
  filtroCartera: FiltroCartera = 'todos';

  form = {
    motoId: '',
    fechaPago: new Date().toISOString().slice(0, 10),
    valorPagado: 0,
    gastos: 0,
    descripcionGasto: '',
    metodoPago: 'TRANSFERENCIA',
    observaciones: '',
  };

  cobroPagoForm = {
    cobroId: '',
    conductorNombre: '',
    periodoLabel: '',
    saldo: 0,
    monto: 0,
    metodoPago: 'Transferencia',
    observaciones: '',
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
            contratos: this.contratosService
              .getContratos({ estado: 'activo' })
              .pipe(catchError(() => of([] as Contrato[]))),
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
          this.cartera = this.construirCartera(cobros, contratos);
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

  private construirCartera(cobros: Cobro[], contratos: Contrato[]): ItemCartera[] {
    const items: ItemCartera[] = [];

    for (const contrato of contratos) {
      if (!contrato._id) continue;

      const cobro = cobroPeriodoVigente(
        cobros,
        contrato._id,
        contrato.fechaInicio,
        contrato.frecuenciaPago || 'semanal',
      );

      if (!cobro || cobro.saldo <= 0 || cobro.estado === 'anulado' || cobro.estado === 'pagado') {
        continue;
      }

      const dias = diasHasta(cobro.fechaVencimiento);
      const diasMora = cobro.enMora && dias !== null ? Math.max(0, -dias) : 0;

      let motoPlaca = '—';
      if (contrato.motoId && typeof contrato.motoId !== 'string') {
        motoPlaca = (contrato.motoId as Moto).placa || '—';
      }

      items.push({
        cobro,
        frecuencia: contrato.frecuenciaPago || 'semanal',
        conductorNombre: this.nombreConductorCobro(cobro),
        motoPlaca,
        diasMora,
      });
    }

    return items.sort((a, b) => {
      if (a.cobro.enMora !== b.cobro.enMora) return a.cobro.enMora ? -1 : 1;
      return (
        parseDateOnly(a.cobro.fechaVencimiento).getTime() -
        parseDateOnly(b.cobro.fechaVencimiento).getTime()
      );
    });
  }

  get carteraFiltrada(): ItemCartera[] {
    switch (this.filtroCartera) {
      case 'mora':
        return this.cartera.filter((i) => i.cobro.enMora);
      case 'pendientes':
        return this.cartera.filter((i) => !i.cobro.enMora && i.cobro.saldo > 0);
      case 'al_dia':
        return this.cartera.filter((i) => !i.cobro.enMora);
      default:
        return this.cartera;
    }
  }

  get totalEnMora(): number {
    return this.cartera.filter((i) => i.cobro.enMora).length;
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
      periodoLabel: `#${item.cobro.numeroPeriodo} · ${this.etiquetaFrecuencia(item.frecuencia)}`,
      saldo: item.cobro.saldo,
      monto: item.cobro.saldo,
      metodoPago: 'Transferencia',
      observaciones: '',
    };
    this.mostrarModalCobro = true;
  }

  cerrarModalCobro(): void {
    this.mostrarModalCobro = false;
  }

  guardarPagoCobro(): void {
    if (!this.cobroPagoForm.cobroId || !this.cobroPagoForm.monto || this.cobroPagoForm.monto <= 0) {
      Swal.fire({ icon: 'warning', title: 'Indica un monto válido' });
      return;
    }
    this.cobrosService
      .registrarAbono({
        cobroId: this.cobroPagoForm.cobroId,
        monto: this.cobroPagoForm.monto,
        metodoPago: this.cobroPagoForm.metodoPago,
        observaciones: this.cobroPagoForm.observaciones || undefined,
        origenAbono: 'admin',
        pendienteConfirmacion: false,
      })
      .subscribe({
        next: () => {
          this.mostrarModalCobro = false;
          Swal.fire({
            icon: 'success',
            title: 'Pago registrado',
            text: 'El cobro se actualizó. Si quedó saldado, ya no estará en mora.',
            timer: 2000,
            showConfirmButton: false,
          });
          this.cargarCartera(true);
          this.cargarAbonosPendientes();
          this.cargar();
        },
        error: (e) =>
          Swal.fire({
            icon: 'error',
            title: 'No se pudo registrar',
            text: e?.error?.message || e?.message || '',
          }),
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
