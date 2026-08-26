import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { PlanesService } from '../../../service/planes.service';
import { CreatePlanPayload, Plan } from '../../../shared/interfaces/plan';
import { FrecuenciaPago } from '../../../shared/periodo.util';
import { PERIODICIDADES, periodicidadesDe } from '../../../shared/plan-economia';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import { labelFrecuencia } from '../../../shared/contrato.rules';

@Component({
  selector: 'app-planes',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './planes.component.html',
})
export class PlanesComponent implements OnInit {
  planes: Plan[] = [];
  cargando = false;
  guardando = false;
  busqueda = '';
  mostrarInactivos = true;
  modal = false;
  modoEdicion = false;
  editandoId: string | null = null;
  form: CreatePlanPayload = this.formVacio();
  readonly periodicidades = PERIODICIDADES;

  constructor(private planesService: PlanesService) {}

  ngOnInit(): void {
    this.cargar();
  }

  formVacio(): CreatePlanPayload {
    return {
      nombre: '',
      descripcion: '',
      condicionesUso: '',
      periodicidadesPermitidas: ['semanal'],
      valorSugerido: 0,
      permiteNegociacion: true,
      duracionMinimaMeses: 3,
      requiereCuotaInicial: false,
      activo: true,
    };
  }

  get planesFiltrados(): Plan[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.planes.filter((p) => {
      if (!this.mostrarInactivos && !p.activo) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        p.condicionesUso.toLowerCase().includes(q)
      );
    });
  }

  get totalActivos(): number {
    return this.planes.filter((p) => p.activo).length;
  }

  cargar(): void {
    this.cargando = true;
    this.planesService.getPlanes(true).subscribe({
      next: (planes) => {
        this.planes = planes;
        this.cargando = false;
      },
      error: (e) => {
        this.cargando = false;
        Swal.fire({
          icon: 'error',
          title: 'No se pudieron cargar planes',
          text: e?.message || e?.error?.message || '¿Corriste el SQL 20260828_planes_catalogo.sql?',
        });
      },
    });
  }

  abrirCrear(): void {
    this.modoEdicion = false;
    this.editandoId = null;
    this.form = this.formVacio();
    this.modal = true;
  }

  abrirEditar(plan: Plan): void {
    this.modoEdicion = true;
    this.editandoId = plan._id || null;
    this.form = {
      nombre: plan.nombre,
      descripcion: plan.descripcion,
      condicionesUso: plan.condicionesUso,
      periodicidadesPermitidas: [...periodicidadesDe(plan)],
      valorSugerido: plan.valorSugerido,
      permiteNegociacion: plan.permiteNegociacion,
      duracionMinimaMeses: plan.duracionMinimaMeses,
      requiereCuotaInicial: plan.requiereCuotaInicial,
      activo: plan.activo,
    };
    this.modal = true;
  }

  cerrar(): void {
    this.modal = false;
    this.guardando = false;
    this.editandoId = null;
    this.form = this.formVacio();
  }

  tienePeriodicidad(f: FrecuenciaPago): boolean {
    return this.form.periodicidadesPermitidas.includes(f);
  }

  togglePeriodicidad(f: FrecuenciaPago): void {
    const set = new Set(this.form.periodicidadesPermitidas);
    if (set.has(f)) set.delete(f);
    else set.add(f);
    this.form.periodicidadesPermitidas = PERIODICIDADES.filter((p) => set.has(p));
  }

  labelFrecuencia(f: FrecuenciaPago): string {
    return labelFrecuencia(f);
  }

  guardar(): void {
    const nombre = this.form.nombre.trim();
    if (!nombre) {
      Swal.fire({ icon: 'warning', title: 'El plan necesita un nombre' });
      return;
    }
    if (!this.form.periodicidadesPermitidas.length) {
      Swal.fire({ icon: 'warning', title: 'Elige al menos una frecuencia' });
      return;
    }
    if (this.form.valorSugerido < 0) {
      Swal.fire({ icon: 'warning', title: 'El valor sugerido no puede ser negativo' });
      return;
    }
    if (!this.form.duracionMinimaMeses || this.form.duracionMinimaMeses < 1) {
      Swal.fire({ icon: 'warning', title: 'Duración mínima: al menos 1 mes' });
      return;
    }
    this.guardando = true;
    const payload: CreatePlanPayload = { ...this.form, nombre };
    const req = this.modoEdicion && this.editandoId
      ? this.planesService.update(this.editandoId, payload)
      : this.planesService.create(payload);
    req.subscribe({
      next: (plan) => {
        this.guardando = false;
        if (this.modoEdicion) {
          const i = this.planes.findIndex((p) => p._id === plan._id);
          if (i >= 0) this.planes[i] = plan;
        } else {
          this.planes = [...this.planes, plan].sort((a, b) => a.nombre.localeCompare(b.nombre));
        }
        this.cerrar();
        Swal.fire({
          icon: 'success',
          title: this.modoEdicion ? 'Plan actualizado' : 'Plan creado',
          text: 'Los contratos ya firmados no cambian. El valor sugerido solo aplica a contratos nuevos.',
          toast: true,
          timer: 2200,
          showConfirmButton: false,
          position: 'top-end',
        });
      },
      error: (e) => {
        this.guardando = false;
        const msg = e?.message || e?.error?.message || 'No se pudo guardar';
        Swal.fire({
          icon: 'error',
          title: msg.includes('planes_nombre_key') || msg.toLowerCase().includes('duplicate')
            ? 'Ya existe un plan con ese nombre'
            : msg,
        });
      },
    });
  }

  toggleActivo(plan: Plan): void {
    if (!plan._id) return;
    const activar = !plan.activo;
    Swal.fire({
      title: activar ? '¿Activar plan?' : '¿Desactivar plan?',
      text: activar
        ? 'Volverá a aparecer al crear contratos.'
        : 'Los contratos ya creados conservan su plan_nombre y cuota pactada.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: activar ? 'Activar' : 'Desactivar',
      confirmButtonColor: activar ? '#059669' : '#dc2626',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.planesService.setActivo(plan._id!, activar).subscribe({
        next: (p) => {
          const i = this.planes.findIndex((x) => x._id === p._id);
          if (i >= 0) this.planes[i] = p;
        },
        error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'No se pudo cambiar el estado' }),
      });
    });
  }

  frecuenciasDe(plan: Plan): string {
    return periodicidadesDe(plan).map((f) => labelFrecuencia(f)).join(', ');
  }
}
