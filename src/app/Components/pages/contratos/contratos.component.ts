import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import Swal from 'sweetalert2';
import { ContratosService, Contrato, CreateContratoPayload } from '../../../service/contratos.service';
import { CobrosService } from '../../../service/cobros.service';
import { MotosService } from '../../../service/motos.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { AuthService } from '../../../auth/auth.service';
import { Moto } from '../../../shared/interfaces/moto';
import { Usuario } from '../../../shared/interfaces/usuario';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import { CUOTA_SEMANAL_ESTANDAR, DEPOSITO_ESTANDAR } from '../../../shared/constants';
import { FrecuenciaPago, toDateOnlyString } from '../../../shared/periodo.util';
import {
  ContratoEstado,
  cuotaSugeridaPorFrecuencia,
  duracionMinimaValida,
  etiquetaMoto,
  fechaFinMinima,
  idDeRelacion,
  labelFrecuencia,
  mensajeErrorContrato,
  nombreConductor,
} from '../../../shared/contrato.rules';

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './contratos.component.html',
})
export class ContratosComponent implements OnInit {
  contratos: Contrato[] = [];
  motos: Moto[] = [];
  conductores: Usuario[] = [];
  cargando = false;
  guardando = false;
  busqueda = '';
  filtroEstado: 'todos' | ContratoEstado = 'todos';

  modalCrear = false;
  modalVer = false;
  contratoVer: Contrato | null = null;
  form: CreateContratoPayload = this.formVacio();

  readonly cuotaEstandar = CUOTA_SEMANAL_ESTANDAR;

  constructor(
    private contratosService: ContratosService,
    private cobrosService: CobrosService,
    private motosService: MotosService,
    private usuariosService: UsuariosService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  formVacio(): CreateContratoPayload {
    const inicio = toDateOnlyString(new Date());
    return {
      conductorId: '',
      motoId: '',
      fechaInicio: inicio,
      fechaFin: fechaFinMinima(inicio),
      cuotaSemanal: CUOTA_SEMANAL_ESTANDAR,
      depositoPactado: DEPOSITO_ESTANDAR,
      frecuenciaPago: 'semanal',
    };
  }

  get contratosFiltrados(): Contrato[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.contratos.filter((c) => {
      if (this.filtroEstado !== 'todos' && c.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return (
        this.nombreDe(c).toLowerCase().includes(q) ||
        this.motoDe(c).toLowerCase().includes(q) ||
        c.estado.toLowerCase().includes(q)
      );
    });
  }

  get totalActivos(): number {
    return this.contratos.filter((c) => c.estado === 'activo').length;
  }
  get totalBorradores(): number {
    return this.contratos.filter((c) => c.estado === 'borrador').length;
  }
  get totalCerrados(): number {
    return this.contratos.filter((c) => c.estado === 'finalizado' || c.estado === 'anulado').length;
  }

  get motosLibres(): Moto[] {
    const ocupadas = new Set(
      this.contratos.filter((c) => c.estado === 'activo').map((c) => idDeRelacion(c.motoId)),
    );
    return this.motos.filter(
      (m) => m.estado === 'disponible' && !m.conductorId && m._id && !ocupadas.has(m._id),
    );
  }

  get conductoresLibres(): Usuario[] {
    const ocupados = new Set(
      this.contratos.filter((c) => c.estado === 'activo').map((c) => idDeRelacion(c.conductorId)),
    );
    return this.conductores.filter((u) => u._id && !ocupados.has(u._id));
  }

  cargar(): void {
    this.cargando = true;
    forkJoin({
      contratos: this.contratosService.getContratos().pipe(catchError(() => of([] as Contrato[]))),
      motos: this.motosService.getMotos().pipe(catchError(() => of([] as Moto[]))),
      usuarios: this.usuariosService.getUsuarios(false).pipe(catchError(() => of([] as Usuario[]))),
    }).subscribe({
      next: ({ contratos, motos, usuarios }) => {
        this.contratos = contratos;
        this.motos = motos;
        this.conductores = usuarios.filter((u) => u.rol === 'empleado' && u.activo);
        this.cargando = false;
      },
      error: (e) => {
        this.cargando = false;
        Swal.fire({ icon: 'error', title: 'No se pudieron cargar contratos', text: mensajeErrorContrato(e) });
      },
    });
  }

  abrirCrear(): void {
    this.form = this.formVacio();
    this.modalCrear = true;
  }

  cerrarCrear(): void {
    this.modalCrear = false;
    this.guardando = false;
  }

  onCambioInicio(): void {
    if (!duracionMinimaValida(this.form.fechaInicio, this.form.fechaFin || '')) {
      this.form.fechaFin = fechaFinMinima(this.form.fechaInicio);
    }
  }

  onCambioFrecuencia(): void {
    const f = (this.form.frecuenciaPago || 'semanal') as FrecuenciaPago;
    this.form.cuotaSemanal = cuotaSugeridaPorFrecuencia(f, CUOTA_SEMANAL_ESTANDAR);
  }

  onCambioMoto(): void {
    const moto = this.motos.find((m) => m._id === this.form.motoId);
    if (moto?.precioCobro) this.form.cuotaSemanal = moto.precioCobro;
  }

  labelCuota(): string {
    switch (this.form.frecuenciaPago) {
      case 'quincenal':
        return 'Cuota quincenal';
      case 'mensual':
        return 'Cuota mensual';
      default:
        return 'Cuota semanal';
    }
  }

  guardar(): void {
    if (!this.form.conductorId || !this.form.motoId) {
      Swal.fire({ icon: 'warning', title: 'Elige conductor y moto' });
      return;
    }
    if (!this.form.fechaFin || !duracionMinimaValida(this.form.fechaInicio, this.form.fechaFin)) {
      Swal.fire({
        icon: 'warning',
        title: 'Duración mínima 3 meses',
        text: `La fecha fin debe ser al menos ${fechaFinMinima(this.form.fechaInicio)}.`,
      });
      return;
    }
    if (!this.form.cuotaSemanal || this.form.cuotaSemanal <= 0) {
      Swal.fire({ icon: 'warning', title: 'La cuota debe ser mayor a 0' });
      return;
    }
    this.guardando = true;
    this.contratosService.create(this.form).subscribe({
      next: (c) => {
        this.contratos = [c, ...this.contratos];
        this.cerrarCrear();
        Swal.fire({
          icon: 'success',
          title: 'Contrato creado en borrador',
          text: 'Actívalo para asignar la moto y empezar a generar cobros.',
          toast: true,
          timer: 2200,
          showConfirmButton: false,
          position: 'top-end',
        });
        this.cargar();
      },
      error: (e) => {
        this.guardando = false;
        Swal.fire({ icon: 'error', title: mensajeErrorContrato(e) });
      },
    });
  }

  ver(c: Contrato): void {
    this.contratoVer = c;
    this.modalVer = true;
  }

  activar(c: Contrato): void {
    if (!c._id) return;
    Swal.fire({
      title: '¿Activar contrato?',
      text: `Se asignará ${this.motoDe(c)} a ${this.nombreDe(c)}. Un conductor y una moto solo pueden tener un contrato activo.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Activar',
      confirmButtonColor: '#059669',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.contratosService.activar(c._id!, this.auth.getUserId() || '').subscribe({
        next: () => {
          this.cobrosService.generarPendientes().pipe(catchError(() => of([]))).subscribe();
          Swal.fire({
            icon: 'success',
            title: 'Contrato activo',
            text: 'La moto quedó asignada. Los cobros se generan desde este contrato.',
            toast: true,
            timer: 2000,
            showConfirmButton: false,
            position: 'top-end',
          });
          this.cargar();
        },
        error: (e) => Swal.fire({ icon: 'error', title: mensajeErrorContrato(e) }),
      });
    });
  }

  finalizar(c: Contrato): void {
    if (!c._id) return;
    Swal.fire({
      title: '¿Finalizar contrato?',
      text: 'La moto se libera. Los cobros y pagos ya generados se conservan.',
      icon: 'warning',
      input: 'select',
      inputOptions: {
        disponible: 'Moto disponible',
        en_mantenimiento: 'Moto a mantenimiento',
        fuera_servicio: 'Moto fuera de servicio',
      },
      inputValue: 'disponible',
      showCancelButton: true,
      confirmButtonText: 'Finalizar',
      confirmButtonColor: '#ea580c',
    }).then((r) => {
      if (!r.isConfirmed) return;
      const condicion = (r.value || 'disponible') as 'disponible' | 'en_mantenimiento' | 'fuera_servicio';
      this.contratosService.finalizarDesdeDevolucion(c._id!, condicion).subscribe({
        next: () => {
          Swal.fire({
            icon: 'success',
            title: 'Contrato finalizado',
            toast: true,
            timer: 1600,
            showConfirmButton: false,
            position: 'top-end',
          });
          this.cargar();
        },
        error: (e) => Swal.fire({ icon: 'error', title: mensajeErrorContrato(e) }),
      });
    });
  }

  anular(c: Contrato): void {
    if (!c._id) return;
    Swal.fire({
      title: '¿Anular borrador?',
      text: 'No se puede anular un contrato activo; hay que finalizarlo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Anular',
      confirmButtonColor: '#dc2626',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.contratosService.anular(c._id!).subscribe({
        next: () => {
          Swal.fire({
            icon: 'success',
            title: 'Contrato anulado',
            toast: true,
            timer: 1400,
            showConfirmButton: false,
            position: 'top-end',
          });
          this.cargar();
        },
        error: (e) => Swal.fire({ icon: 'error', title: mensajeErrorContrato(e) }),
      });
    });
  }

  nombreDe(c: Contrato): string {
    return nombreConductor(c.conductorId);
  }

  motoDe(c: Contrato): string {
    return etiquetaMoto(c.motoId);
  }

  frecuenciaDe(c: Contrato): string {
    return labelFrecuencia(c.frecuenciaPago);
  }

  estadoClass(estado: ContratoEstado | string): string {
    if (estado === 'activo') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (estado === 'borrador') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (estado === 'finalizado') return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    return 'bg-red-500/15 text-red-300 border-red-500/30';
  }

  estadoLabel(estado: ContratoEstado | string): string {
    if (estado === 'activo') return 'Activo';
    if (estado === 'borrador') return 'Borrador';
    if (estado === 'finalizado') return 'Finalizado';
    if (estado === 'anulado') return 'Anulado';
    return estado;
  }

  fechaCorta(value?: string | null): string {
    if (!value) return '—';
    const d = String(value).slice(0, 10);
    const [y, m, day] = d.split('-');
    if (!y || !m || !day) return d;
    return `${day}/${m}/${y}`;
  }
}
