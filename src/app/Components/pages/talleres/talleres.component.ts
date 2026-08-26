import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import Swal from 'sweetalert2';
import { TalleresService } from '../../../service/talleres.service';
import { CreateTallerPayload, TallerConfianza } from '../../../shared/interfaces/taller-confianza';
import {
  coordsValidas,
  googleMapsDirectionsUrl,
  osmEmbedUrl,
  osmMapUrl,
  puntoDe,
} from '../../../shared/taller-geo';

@Component({
  selector: 'app-talleres',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './talleres.component.html',
})
export class TalleresComponent implements OnInit {
  talleres: TallerConfianza[] = [];
  cargando = false;
  guardando = false;
  busqueda = '';
  mostrarInactivos = true;
  modal = false;
  modoEdicion = false;
  editandoId: string | null = null;
  form: CreateTallerPayload = this.formVacio();

  constructor(
    private talleresService: TalleresService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  formVacio(): CreateTallerPayload {
    return {
      nombre: '',
      direccion: '',
      telefono: '',
      latitud: 0,
      longitud: 0,
      horario: '',
      servicios: '',
      activo: true,
    };
  }

  get talleresFiltrados(): TallerConfianza[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.talleres.filter((t) => {
      if (!this.mostrarInactivos && !t.activo) return false;
      if (!q) return true;
      return (
        t.nombre.toLowerCase().includes(q) ||
        t.direccion.toLowerCase().includes(q) ||
        t.telefono.toLowerCase().includes(q) ||
        t.servicios.toLowerCase().includes(q)
      );
    });
  }

  get totalActivos(): number {
    return this.talleres.filter((t) => t.activo).length;
  }

  get previewEmbed(): SafeResourceUrl | null {
    if (!coordsValidas(Number(this.form.latitud), Number(this.form.longitud))) return null;
    if (this.form.latitud === 0 && this.form.longitud === 0) return null;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      osmEmbedUrl({ lat: Number(this.form.latitud), lng: Number(this.form.longitud) }),
    );
  }

  cargar(): void {
    this.cargando = true;
    this.talleresService.getTalleres(true).subscribe({
      next: (talleres) => {
        this.talleres = talleres;
        this.cargando = false;
      },
      error: (e) => {
        this.cargando = false;
        Swal.fire({
          icon: 'error',
          title: 'No se pudieron cargar talleres',
          text: e?.message || e?.error?.message || '¿Corriste el SQL 20260829_talleres_confianza.sql?',
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

  abrirEditar(taller: TallerConfianza): void {
    this.modoEdicion = true;
    this.editandoId = taller._id || null;
    this.form = {
      nombre: taller.nombre,
      direccion: taller.direccion,
      telefono: taller.telefono,
      latitud: taller.latitud,
      longitud: taller.longitud,
      horario: taller.horario,
      servicios: taller.servicios,
      activo: taller.activo,
    };
    this.modal = true;
  }

  cerrar(): void {
    this.modal = false;
    this.guardando = false;
    this.editandoId = null;
    this.form = this.formVacio();
  }

  pinUrl(taller: TallerConfianza): string | null {
    const p = puntoDe(taller);
    return p ? osmMapUrl(p) : null;
  }

  comoLlegarUrl(taller: TallerConfianza): string | null {
    const p = puntoDe(taller);
    return p ? googleMapsDirectionsUrl(p) : null;
  }

  guardar(): void {
    const nombre = this.form.nombre.trim();
    const direccion = this.form.direccion.trim();
    const telefono = this.form.telefono.trim();
    if (!nombre) {
      Swal.fire({ icon: 'warning', title: 'El taller necesita un nombre' });
      return;
    }
    if (!direccion) {
      Swal.fire({ icon: 'warning', title: 'La dirección es obligatoria' });
      return;
    }
    if (!telefono) {
      Swal.fire({ icon: 'warning', title: 'El teléfono es obligatorio' });
      return;
    }
    const lat = Number(this.form.latitud);
    const lng = Number(this.form.longitud);
    if (!coordsValidas(lat, lng) || (lat === 0 && lng === 0)) {
      Swal.fire({
        icon: 'warning',
        title: 'Latitud y longitud',
        text: 'Ingresa coordenadas válidas (ej. Bogotá 4.7110, -74.0721). 0,0 no es un punto real.',
      });
      return;
    }
    this.guardando = true;
    const payload: CreateTallerPayload = {
      ...this.form,
      nombre,
      direccion,
      telefono,
      latitud: lat,
      longitud: lng,
      horario: this.form.horario.trim(),
      servicios: this.form.servicios.trim(),
    };
    const req =
      this.modoEdicion && this.editandoId
        ? this.talleresService.update(this.editandoId, payload)
        : this.talleresService.create(payload);
    req.subscribe({
      next: (taller) => {
        this.guardando = false;
        if (this.modoEdicion) {
          const i = this.talleres.findIndex((t) => t._id === taller._id);
          if (i >= 0) this.talleres[i] = taller;
        } else {
          this.talleres = [...this.talleres, taller].sort((a, b) =>
            a.nombre.localeCompare(b.nombre),
          );
        }
        this.cerrar();
        Swal.fire({
          icon: 'success',
          title: this.modoEdicion ? 'Taller actualizado' : 'Taller creado',
          toast: true,
          timer: 2200,
          showConfirmButton: false,
          position: 'top-end',
        });
      },
      error: (e) => {
        this.guardando = false;
        Swal.fire({
          icon: 'error',
          title: e?.message || e?.error?.message || 'No se pudo guardar',
        });
      },
    });
  }

  toggleActivo(taller: TallerConfianza): void {
    if (!taller._id) return;
    const activar = !taller.activo;
    Swal.fire({
      title: activar ? '¿Activar taller?' : '¿Desactivar taller?',
      text: activar
        ? 'Volverá a aparecer en el panel del conductor.'
        : 'Los conductores dejarán de verlo. El registro se conserva.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: activar ? 'Activar' : 'Desactivar',
      confirmButtonColor: activar ? '#059669' : '#dc2626',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.talleresService.setActivo(taller._id!, activar).subscribe({
        next: (t) => {
          const i = this.talleres.findIndex((x) => x._id === t._id);
          if (i >= 0) this.talleres[i] = t;
        },
        error: (e) =>
          Swal.fire({ icon: 'error', title: e?.message || 'No se pudo cambiar el estado' }),
      });
    });
  }
}
