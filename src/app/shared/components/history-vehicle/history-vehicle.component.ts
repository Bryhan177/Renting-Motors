import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MotosService } from '../../../service/motos.service';
import { ContratosService } from '../../../service/contratos.service';
import { PagosService, PagoManual } from '../../../service/pagos.service';
import { MantenimientosService, Mantenimiento } from '../../../service/mantenimientos.service';
import { Moto } from '../../../shared/interfaces/moto';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface HistorialMdd {
  moto: Moto;
  contratos: number;
  pagos: PagoManual[];
  mantenimientos: Mantenimiento[];
  totalPagado: number;
  totalGastos: number;
}

@Component({
  selector: 'app-history-vehicle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history-vehicle.component.html',
  styleUrl: './history-vehicle.component.css',
})
export class HistoryVehicleComponent implements OnInit {
  items: HistorialMdd[] = [];
  filtrados: HistorialMdd[] = [];
  busqueda = '';
  seleccionado: HistorialMdd | null = null;
  loading = true;

  constructor(
    private motos: MotosService,
    private contratos: ContratosService,
    private pagos: PagosService,
    private mant: MantenimientosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    forkJoin({
      motos: this.motos.getMotosLista().pipe(catchError(() => of([]))),
      contratos: this.contratos.getContratos().pipe(catchError(() => of([]))),
      pagos: this.pagos.getPagos().pipe(catchError(() => of([]))),
      mant: this.mant.list().pipe(catchError(() => of([]))),
    }).subscribe(({ motos, contratos, pagos, mant }) => {
      this.items = motos.map((moto) => {
        const pagosMoto = pagos.filter((p) => p.motoId === moto._id);
        const mantMoto = mant.filter((m) => m.motoId === moto._id);
        const contratosMoto = contratos.filter((c) => {
          const mid = typeof c.motoId === 'string' ? c.motoId : (c.motoId as any)?._id;
          return mid === moto._id;
        });
        return {
          moto,
          contratos: contratosMoto.length,
          pagos: pagosMoto,
          mantenimientos: mantMoto,
          totalPagado: pagosMoto.reduce((s, p) => s + p.valorPagado, 0),
          totalGastos: pagosMoto.reduce((s, p) => s + p.gastos, 0),
        };
      });
      this.aplicarFiltro();
      this.loading = false;
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.trim().toLowerCase();
    this.filtrados = !q
      ? this.items
      : this.items.filter(
          (i) =>
            i.moto.placa.toLowerCase().includes(q) ||
            i.moto.marca.toLowerCase().includes(q) ||
            i.moto.modelo.toLowerCase().includes(q),
        );
  }

  ver(item: HistorialMdd): void {
    this.seleccionado = item;
  }
}
