import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import Swal from 'sweetalert2';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import { CobrosService } from '../../../service/cobros.service';
import { MotosService } from '../../../service/motos.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { PlanesService } from '../../../service/planes.service';
import { AuthService } from '../../../auth/auth.service';
import { Moto } from '../../../shared/interfaces/moto';
import { Usuario } from '../../../shared/interfaces/usuario';
import { Plan } from '../../../shared/interfaces/plan';
import { ContratoWizardComponent } from '../../../shared/components/contrato-wizard/contrato-wizard.component';
import { ContratoWizardForm, formularioListoParaCrear, planDeFormulario } from '../../../shared/contrato-wizard';
import {
  ContratoEstado,
  etiquetaMoto,
  idDeRelacion,
  labelFrecuencia,
  mensajeErrorContrato,
  nombreConductor,
} from '../../../shared/contrato.rules';
import { etiquetaPlan } from '../../../shared/plan-economia';

@Component({
  selector: 'app-contratos',
  standalone: true,
  imports: [CommonModule, FormsModule, ContratoWizardComponent],
  templateUrl: './contratos.component.html',
})
export class ContratosComponent implements OnInit {
  contratos: Contrato[] = [];
  motos: Moto[] = [];
  conductores: Usuario[] = [];
  planes: Plan[] = [];
  cargando = false;
  guardando = false;
  busqueda = '';
  filtroEstado: 'todos' | ContratoEstado = 'todos';

  modalCrear = false;
  modalVer = false;
  contratoVer: Contrato | null = null;

  constructor(
    private contratosService: ContratosService,
    private cobrosService: CobrosService,
    private motosService: MotosService,
    private usuariosService: UsuariosService,
    private planesService: PlanesService,
    private auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get contratosFiltrados(): Contrato[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.contratos.filter((c) => {
      if (this.filtroEstado !== 'todos' && c.estado !== this.filtroEstado) return false;
      if (!q) return true;
      return (
        this.nombreDe(c).toLowerCase().includes(q) ||
        this.motoDe(c).toLowerCase().includes(q) ||
        this.planDe(c).toLowerCase().includes(q) ||
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
    this.contratosService.getContratos().pipe(catchError(() => of([] as Contrato[]))).subscribe({
      next: (contratos) => {
        this.contratos = contratos;
        this.cargando = false;
      },
      error: (e) => {
        this.cargando = false;
        Swal.fire({ icon: 'error', title: 'No se pudieron cargar contratos', text: mensajeErrorContrato(e) });
      },
    });
  }

  /** Motos/usuarios/planes solo al abrir el wizard — la tabla no espera MotosService. */
  private cargarCatalogoWizard(): void {
    this.motosService.getMotosLista().pipe(catchError(() => of([] as Moto[]))).subscribe({
      next: (motos) => (this.motos = motos),
    });
    this.usuariosService.getUsuarios(false).pipe(catchError(() => of([] as Usuario[]))).subscribe({
      next: (usuarios) => (this.conductores = usuarios.filter((u) => u.rol === 'empleado' && u.activo)),
    });
    this.planesService.getActivos().pipe(catchError(() => of([] as Plan[]))).subscribe({
      next: (planes) => (this.planes = planes),
    });
  }

  abrirCrear(): void {
    this.modalCrear = true;
    this.guardando = false;
    this.cargarCatalogoWizard();
  }

  cerrarCrear(): void {
    this.modalCrear = false;
    this.guardando = false;
  }

  crearDesdeWizard(payload: ContratoWizardForm): void {
    const plan = planDeFormulario(this.planes, payload);
    const check = formularioListoParaCrear(payload, plan);
    if (!check.ok) {
      Swal.fire({ icon: 'warning', title: check.mensaje || 'Completa los pasos del contrato' });
      return;
    }
    this.guardando = true;
    this.contratosService.create(payload).subscribe({
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

  planDe(c: Contrato): string {
    return etiquetaPlan(c.planNombre);
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
