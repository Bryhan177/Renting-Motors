import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MotosService } from '../../../service/motos.service';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import { CobrosService, Abono, Cobro, IngresoMensual } from '../../../service/cobros.service';
import { NovedadesService, Novedad, EstadoNovedad } from '../../../service/novedades.service';
import { Moto } from '../../../shared/interfaces/moto';
import { Estadisticas } from '../../../shared/interfaces/pago';
import { diasHasta, etiquetaVencimiento } from '../../../shared/date.util';
import { cobroPeriodoVigente, parseDateOnly } from '../../../shared/periodo.util';
import Swal from 'sweetalert2';

interface AlertaVencimiento {
  moto: Moto;
  tipo: 'SOAT' | 'Tecnomecánica' | 'Cuota';
  fecha: string;
  dias: number;
  detalle?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  motos: Moto[] = [];
  contratosActivos: Contrato[] = [];
  private todosLosCobros: Cobro[] = [];
  cobrosPendientes: Cobro[] = [];
  cobrosEnMora: Cobro[] = [];
  abonosPendientes: Abono[] = [];
  novedadesAbiertas: Novedad[] = [];
  alertas: AlertaVencimiento[] = [];
  estadisticas: Estadisticas | null = null;
  loading = true;
  totalPagado = 0;
  totalPendiente = 0;
  totalMora = 0;

  /** Métricas de crecimiento */
  mesesCrecimiento: 6 | 12 = 12;
  ingresosMensuales: IngresoMensual[] = [];
  cargandoCrecimiento = false;

  constructor(
    private motosService: MotosService,
    private cobrosService: CobrosService,
    private contratosService: ContratosService,
    private novedadesService: NovedadesService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;

    this.motosService.getEstadisticas().subscribe({
      next: (estadisticas) => {
        this.estadisticas = estadisticas;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });

    this.motosService.getMotos().subscribe({
      next: (motos) => {
        this.motos = motos;
        this.recalcularAlertas();
      },
      error: () => {},
    });

    this.contratosService.getContratos({ estado: 'activo' }).subscribe({
      next: (contratos) => {
        this.contratosActivos = contratos;
        this.actualizarCobrosVigentes();
        this.recalcularAlertas();
      },
      error: () => {
        this.contratosActivos = [];
        this.actualizarCobrosVigentes();
      },
    });

    this.cobrosService.getCobros().subscribe({
      next: (cobros) => {
        this.todosLosCobros = cobros;
        this.actualizarCobrosVigentes();
        this.recalcularAlertas();
      },
      error: () => {
        this.todosLosCobros = [];
        this.cobrosPendientes = [];
        this.cobrosEnMora = [];
      },
    });

    this.cobrosService.getAbonos('pendiente_confirmacion').subscribe({
      next: (list) => (this.abonosPendientes = list),
      error: () => (this.abonosPendientes = []),
    });

    this.novedadesService.list().subscribe({
      next: (list) =>
        (this.novedadesAbiertas = list.filter(
          (n) => n.estado === 'abierta' || n.estado === 'en_proceso',
        )),
      error: () => (this.novedadesAbiertas = []),
    });

    this.cargarCrecimiento();
  }

  cargarCrecimiento(): void {
    this.cargandoCrecimiento = true;
    this.cobrosService.getIngresosMensuales(this.mesesCrecimiento).subscribe({
      next: (series) => {
        this.ingresosMensuales = series;
        this.cargandoCrecimiento = false;
      },
      error: () => {
        this.ingresosMensuales = [];
        this.cargandoCrecimiento = false;
      },
    });
  }

  setMesesCrecimiento(meses: 6 | 12): void {
    if (this.mesesCrecimiento === meses) return;
    this.mesesCrecimiento = meses;
    this.cargarCrecimiento();
  }

  get totalIngresosPeriodo(): number {
    return this.ingresosMensuales.reduce((s, m) => s + m.monto, 0);
  }

  get maxIngresoMensual(): number {
    return Math.max(0, ...this.ingresosMensuales.map((m) => m.monto));
  }

  get mesActual(): IngresoMensual | null {
    if (!this.ingresosMensuales.length) return null;
    return this.ingresosMensuales[this.ingresosMensuales.length - 1];
  }

  get mesAnterior(): IngresoMensual | null {
    if (this.ingresosMensuales.length < 2) return null;
    return this.ingresosMensuales[this.ingresosMensuales.length - 2];
  }

  /** Variación % del mes actual vs el anterior. null si no hay base. */
  get variacionMensualPct(): number | null {
    const actual = this.mesActual?.monto ?? 0;
    const anterior = this.mesAnterior?.monto ?? 0;
    if (anterior <= 0) return actual > 0 ? 100 : null;
    return Math.round(((actual - anterior) / anterior) * 100);
  }

  get mejorMes(): IngresoMensual | null {
    if (!this.ingresosMensuales.length) return null;
    return this.ingresosMensuales.reduce((best, m) => (m.monto > best.monto ? m : best));
  }

  alturaBarra(monto: number): number {
    const max = this.maxIngresoMensual;
    if (max <= 0) return 0;
    return Math.max(4, Math.round((monto / max) * 100));
  }

  /** Solo la cuota del periodo vigente por contrato activo. */
  private cobrosCuotaActual(cobros: Cobro[]): Cobro[] {
    const items: Cobro[] = [];
    for (const contrato of this.contratosActivos) {
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
      items.push(cobro);
    }
    return items;
  }

  private actualizarCobrosVigentes(): void {
    const vigentes = this.cobrosCuotaActual(this.todosLosCobros);
    this.cobrosPendientes = vigentes.sort((a, b) => {
      if (a.enMora !== b.enMora) return a.enMora ? -1 : 1;
      return (
        parseDateOnly(a.fechaVencimiento).getTime() -
        parseDateOnly(b.fechaVencimiento).getTime()
      );
    });
    this.cobrosEnMora = this.cobrosPendientes.filter((c) => c.enMora);
    this.totalPagado = this.todosLosCobros.reduce((s, c) => s + c.montoPagado, 0);
    this.totalPendiente = this.cobrosPendientes.reduce((s, c) => s + c.saldo, 0);
    this.totalMora = this.cobrosEnMora.reduce((s, c) => s + c.saldo, 0);
  }

  private recalcularAlertas(): void {
    const alertas: AlertaVencimiento[] = [];

    for (const m of this.motos) {
      const soatDias = diasHasta(m.soat);
      if (soatDias !== null && soatDias <= 15) {
        alertas.push({
          moto: m,
          tipo: 'SOAT',
          fecha: String(m.soat),
          dias: soatDias,
        });
      }
      const tecnoDias = diasHasta(m.tecnomecanica);
      if (tecnoDias !== null && tecnoDias <= 15) {
        alertas.push({
          moto: m,
          tipo: 'Tecnomecánica',
          fecha: String(m.tecnomecanica),
          dias: tecnoDias,
        });
      }
    }

    for (const c of this.cobrosPendientes) {
      const dias = diasHasta(c.fechaVencimiento);
      if (dias === null || dias > 7) continue;
      const motoId =
        typeof c.motoId === 'string' ? c.motoId : (c.motoId as Moto | undefined)?._id;
      const moto =
        this.motos.find((m) => m._id === motoId) ||
        ({ placa: '—', marca: '', modelo: '', precio: 0, estado: 'disponible' } as Moto);
      alertas.push({
        moto,
        tipo: 'Cuota',
        fecha: c.fechaVencimiento,
        dias,
        detalle: `Periodo #${c.numeroPeriodo} · ${this.conductorNombre(c)} · $ ${c.saldo.toLocaleString('es-CO')}`,
      });
    }

    alertas.sort((a, b) => a.dias - b.dias);
    this.alertas = alertas.slice(0, 12);
  }

  get motosEnUso(): number {
    return this.motos.filter((m) => m.estado === 'en_uso').length;
  }

  getMotosDisponiblesPorcentaje(): number {
    const total = this.estadisticas?.totalMotos || 0;
    const disp = this.estadisticas?.motosDisponibles || 0;
    return total > 0 ? Math.round((disp / total) * 100) : 0;
  }

  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'disponible':
        return 'bg-green-500/10 text-green-400 border border-green-500/20';
      case 'en_uso':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'en_mantenimiento':
        return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
      case 'fuera_servicio':
        return 'bg-red-500/10 text-red-400 border border-red-500/20';
      default:
        return 'bg-gray-700 text-gray-400';
    }
  }

  getEstadoText(estado: string): string {
    switch (estado) {
      case 'disponible':
        return 'Disponible';
      case 'en_uso':
        return 'En uso';
      case 'en_mantenimiento':
        return 'Mantenimiento';
      case 'fuera_servicio':
        return 'Fuera de servicio';
      default:
        return estado;
    }
  }

  conductorNombre(cobro: Cobro): string {
    if (cobro.conductor) return `${cobro.conductor.nombre} ${cobro.conductor.apellido}`;
    return 'Conductor';
  }

  abonoConductor(a: Abono): string {
    if (a.conductor) return `${a.conductor.nombre} ${a.conductor.apellido}`.trim();
    return 'Conductor';
  }

  etiquetaAlerta(a: AlertaVencimiento): string {
    return etiquetaVencimiento(a.fecha);
  }

  formatearFechaCorta(fecha: string | Date): string {
    const d = parseDateOnly(fecha);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  claseAlerta(dias: number): string {
    if (dias < 0) return 'text-red-400';
    if (dias <= 7) return 'text-amber-400';
    return 'text-yellow-300';
  }

  confirmarAbono(a: Abono): void {
    if (!a._id) return;
    this.cobrosService.confirmarAbono(a._id).subscribe({
      next: () => {
        Swal.fire({ icon: 'success', title: 'Abono confirmado', timer: 1400, showConfirmButton: false });
        this.loadData();
      },
      error: (e) =>
        Swal.fire({ icon: 'error', title: 'Error', text: e?.error?.message || e?.message || '' }),
    });
  }

  rechazarAbono(a: Abono): void {
    if (!a._id) return;
    Swal.fire({
      title: 'Rechazar abono',
      input: 'text',
      inputLabel: 'Motivo',
      showCancelButton: true,
      confirmButtonText: 'Rechazar',
      inputValidator: (v) => (!v?.trim() ? 'Escribe el motivo' : null),
    }).then((r) => {
      if (!r.isConfirmed || !r.value) return;
      this.cobrosService.rechazarAbono(a._id!, String(r.value)).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: 'Rechazado', timer: 1400, showConfirmButton: false });
          this.loadData();
        },
        error: (e) =>
          Swal.fire({ icon: 'error', title: 'Error', text: e?.error?.message || e?.message || '' }),
      });
    });
  }

  atenderNovedad(n: Novedad, estado: EstadoNovedad): void {
    if (!n._id) return;
    Swal.fire({
      title: estado === 'resuelta' ? 'Marcar resuelta' : 'Tomar novedad',
      input: 'textarea',
      inputLabel: 'Respuesta al conductor (opcional)',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.novedadesService
        .actualizarEstado(n._id!, { estado, respuestaStaff: String(r.value || '') })
        .subscribe({
          next: () => {
            Swal.fire({ icon: 'success', title: 'Actualizado', timer: 1200, showConfirmButton: false });
            this.loadData();
          },
          error: (e) =>
            Swal.fire({
              icon: 'error',
              title: 'Error',
              text: e?.message || '¿Ejecutaste el SQL de novedades?',
            }),
        });
    });
  }
}
