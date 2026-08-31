import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MotosService } from '../../../service/motos.service';
import { CobrosService, Abono, Cobro } from '../../../service/cobros.service';
import { NovedadesService, Novedad, EstadoNovedad } from '../../../service/novedades.service';
import { DashboardService } from '../../../service/dashboard.service';
import { Moto } from '../../../shared/interfaces/moto';
import { diasHasta, etiquetaVencimiento } from '../../../shared/date.util';
import { parseDateOnly } from '../../../shared/periodo.util';
import { formatCop } from '../../../shared/currency-co.util';
import {
  PeriodoDashboard,
  ResumenDashboard,
  emptyResumenDashboard,
  etiquetaPeriodo,
  ingresosMensualesVisibles,
  alturaBarra as pctBarra,
  maxMontoSerie,
  porcentajeDisponibles,
} from '../../../shared/dashboard-kpis';
import Swal from 'sweetalert2';

type SeccionDashboard = 'resumen' | 'graficas' | 'cartera' | 'planes';
type SerieChart = 'ingresos' | 'egresos';

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
  cobrosPendientes: Cobro[] = [];
  abonosPendientes: Abono[] = [];
  novedadesAbiertas: Novedad[] = [];
  alertas: AlertaVencimiento[] = [];
  loading = true;
  sqlPendiente = false;

  periodo: PeriodoDashboard = 'mes';
  kpis: ResumenDashboard = emptyResumenDashboard('mes');
  mesesCrecimiento: 6 | 12 = 12;
  seccion: SeccionDashboard = 'resumen';
  serieChart: SerieChart = 'ingresos';

  readonly tabs: { id: SeccionDashboard; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'graficas', label: 'Gráficas' },
    { id: 'cartera', label: 'Cartera' },
    { id: 'planes', label: 'Planes' },
  ];

  constructor(
    private motosService: MotosService,
    private cobrosService: CobrosService,
    private novedadesService: NovedadesService,
    private dashboardService: DashboardService,
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.cargarKpis();
    this.cargarOperativo();
  }

  setPeriodo(periodo: PeriodoDashboard): void {
    if (this.periodo === periodo) return;
    this.periodo = periodo;
    this.cargarKpis();
  }

  cargarKpis(): void {
    this.loading = true;
    this.sqlPendiente = false;
    this.dashboardService.getResumen(this.periodo).subscribe({
      next: (kpis) => {
        this.kpis = kpis;
        this.loading = false;
      },
      error: (e) => {
        this.kpis = emptyResumenDashboard(this.periodo);
        this.loading = false;
        const msg = String(e?.message || e?.error?.message || '');
        this.sqlPendiente =
          /resumen_dashboard|could not find the function|schema cache/i.test(msg);
      },
    });
  }

  cargarOperativo(): void {
    this.motosService.getMotosOperativo().subscribe({
      next: (motos) => {
        this.motos = motos;
        this.recalcularAlertas();
      },
      error: () => {},
    });

    this.cobrosService.getCobros({ soloConSaldo: true }).subscribe({
      next: (cobros) => {
        this.cobrosPendientes = [...cobros].sort((a, b) => {
          if (a.enMora !== b.enMora) return a.enMora ? -1 : 1;
          return (
            parseDateOnly(a.fechaVencimiento).getTime() -
            parseDateOnly(b.fechaVencimiento).getTime()
          );
        });
        this.recalcularAlertas();
      },
      error: () => {
        this.cobrosPendientes = [];
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
  }

  setMesesCrecimiento(meses: 6 | 12): void {
    this.mesesCrecimiento = meses;
  }

  setSeccion(seccion: SeccionDashboard): void {
    this.seccion = seccion;
  }

  setSerieChart(serie: SerieChart): void {
    this.serieChart = serie;
  }

  get mostrandoEgresos(): boolean {
    return this.serieChart === 'egresos';
  }

  get ingresosMensuales() {
    return ingresosMensualesVisibles(this.kpis.ingresosMensuales, this.mesesCrecimiento);
  }

  get egresosMensuales() {
    return ingresosMensualesVisibles(this.kpis.egresosMensuales, this.mesesCrecimiento);
  }

  /** Serie de la gráfica visible (ingresos o egresos, nunca ambas). */
  get serieVisible() {
    return this.mostrandoEgresos ? this.egresosMensuales : this.ingresosMensuales;
  }

  get totalSerieChart(): number {
    return this.serieVisible.reduce((s, m) => s + m.monto, 0);
  }

  get maxSerieChart(): number {
    return maxMontoSerie(this.serieVisible);
  }

  get totalIngresosPeriodoChart(): number {
    return this.ingresosMensuales.reduce((s, m) => s + m.monto, 0);
  }

  get totalEgresosPeriodoChart(): number {
    return this.egresosMensuales.reduce((s, m) => s + m.monto, 0);
  }

  get maxIngresoMensual(): number {
    return maxMontoSerie(this.ingresosMensuales);
  }

  get maxEgresoMensual(): number {
    return maxMontoSerie(this.egresosMensuales);
  }

  get mejorMes() {
    if (!this.ingresosMensuales.length) return null;
    return this.ingresosMensuales.reduce((best, m) => (m.monto > best.monto ? m : best));
  }

  get peorMesEgreso() {
    if (!this.egresosMensuales.length) return null;
    return this.egresosMensuales.reduce((best, m) => (m.monto > best.monto ? m : best));
  }

  get picoSerie() {
    if (!this.serieVisible.length) return null;
    return this.serieVisible.reduce((best, m) => (m.monto > best.monto ? m : best));
  }

  get mesActualSerie(): number {
    return this.mostrandoEgresos ? this.kpis.egresosMesActual : this.kpis.ingresosMesActual;
  }

  get etiquetaRango(): string {
    return etiquetaPeriodo(this.kpis.periodo || this.periodo, this.kpis.periodoDesde, this.kpis.periodoHasta);
  }

  alturaBarra(monto: number): number {
    return pctBarra(monto, this.maxIngresoMensual);
  }

  alturaBarraEgreso(monto: number): number {
    return pctBarra(monto, this.maxEgresoMensual);
  }

  alturaBarraSerie(monto: number): number {
    return pctBarra(monto, this.maxSerieChart);
  }

  alturaBarraPlan(ingresos: number): number {
    const max = Math.max(0, ...this.kpis.planes.map((p) => p.ingresos));
    return pctBarra(ingresos, max);
  }

  cop(value: number | null | undefined): string {
    const n = Number(value) || 0;
    return `$ ${formatCop(n) || '0'}`;
  }

  getMotosDisponiblesPorcentaje(): number {
    return porcentajeDisponibles(this.kpis);
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
        detalle: `Periodo #${c.numeroPeriodo} · ${this.conductorNombre(c)} · ${this.cop(c.saldo)}`,
      });
    }

    alertas.sort((a, b) => a.dias - b.dias);
    this.alertas = alertas.slice(0, 12);
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
