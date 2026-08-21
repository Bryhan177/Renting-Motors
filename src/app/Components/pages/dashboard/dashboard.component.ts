import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MotosService } from '../../../service/motos.service';
import { CobrosService } from '../../../service/cobros.service';
import { Moto } from '../../../shared/interfaces/moto';
import { Estadisticas } from '../../../shared/interfaces/pago';
import { Cobro } from '../../../service/cobros.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  motos: Moto[] = [];
  cobrosPendientes: Cobro[] = [];
  cobrosEnMora: Cobro[] = [];
  estadisticas: Estadisticas | null = null;
  loading = true;
  totalPagado = 0;
  totalPendiente = 0;
  totalMora = 0;

  constructor(
    private motosService: MotosService,
    private cobrosService: CobrosService,
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
      next: (motos) => (this.motos = motos),
      error: () => {},
    });

    this.cobrosService.getCobros().subscribe({
      next: (cobros) => {
        this.cobrosPendientes = cobros.filter((c) => c.saldo > 0);
        this.cobrosEnMora = cobros.filter((c) => c.enMora);
        this.totalPagado = cobros.reduce((s, c) => s + c.montoPagado, 0);
        this.totalPendiente = cobros.reduce((s, c) => s + c.saldo, 0);
        this.totalMora = this.cobrosEnMora.reduce((s, c) => s + c.saldo, 0);
      },
      error: () => {
        this.cobrosPendientes = [];
        this.cobrosEnMora = [];
      },
    });
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
}
