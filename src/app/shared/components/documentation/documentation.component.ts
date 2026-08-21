import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  DocumentosService,
  Documento,
  CategoriaDocumento,
} from '../../../service/documentos.service';
import { MotosService } from '../../../service/motos.service';
import { UsuariosService } from '../../../service/usuarios.service';
import { Moto } from '../../../shared/interfaces/moto';
import { Usuario } from '../../../shared/interfaces/usuario';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-documentation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './documentation.component.html',
  styleUrl: './documentation.component.css',
})
export class DocumentationComponent implements OnInit {
  documentos: Documento[] = [];
  motos: Moto[] = [];
  conductores: Usuario[] = [];
  tab: CategoriaDocumento | 'todos' = 'todos';
  mostrarModal = false;
  editandoId: string | null = null;
  archivo: File | null = null;

  form = {
    categoria: 'contrato_plantilla' as CategoriaDocumento,
    nombre: '',
    descripcion: '',
    conductorId: '' as string | null,
    motoId: '' as string | null,
  };

  categorias: { id: CategoriaDocumento | 'todos'; label: string }[] = [
    { id: 'todos', label: 'Todos' },
    { id: 'contrato_plantilla', label: 'Contratos PDF' },
    { id: 'cc_cliente', label: 'CC cliente' },
    { id: 'licencia', label: 'Licencia' },
    { id: 'matricula_mdd', label: 'Matrícula MDD' },
    { id: 'formulario', label: 'Formularios' },
    { id: 'tecnomecanica', label: 'Tecnomecánicas' },
    { id: 'soat', label: 'SOAT' },
    { id: 'otro', label: 'Otros' },
  ];

  get categoriasForm(): { id: CategoriaDocumento; label: string }[] {
    return this.categorias.filter((c): c is { id: CategoriaDocumento; label: string } => c.id !== 'todos');
  }

  get esEdicion(): boolean {
    return !!this.editandoId;
  }

  constructor(
    private docs: DocumentosService,
    private motosService: MotosService,
    private usuariosService: UsuariosService,
  ) {}

  ngOnInit(): void {
    this.cargar();
    this.motosService.getMotos().subscribe({ next: (m) => (this.motos = m) });
    this.usuariosService.getUsuarios().subscribe({
      next: (u) => (this.conductores = u.filter((x) => x.rol === 'empleado')),
    });
  }

  cargar(): void {
    const cat = this.tab === 'todos' ? undefined : this.tab;
    this.docs.list(cat).subscribe({
      next: (d) => (this.documentos = d),
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }

  cambiarTab(id: CategoriaDocumento | 'todos'): void {
    this.tab = id;
    this.cargar();
  }

  labelCat(c: string): string {
    return this.categorias.find((x) => x.id === c)?.label || c;
  }

  onFile(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    this.archivo = input.files?.[0] || null;
    if (this.archivo && !this.form.nombre) {
      this.form.nombre = this.archivo.name.replace(/\.[^.]+$/, '');
    }
  }

  cerrarModal(): void {
    this.mostrarModal = false;
    this.editandoId = null;
    this.archivo = null;
  }

  abrirSubir(): void {
    this.editandoId = null;
    this.form = {
      categoria: this.tab !== 'todos' ? this.tab : 'contrato_plantilla',
      nombre: '',
      descripcion: '',
      conductorId: null,
      motoId: null,
    };
    this.archivo = null;
    this.mostrarModal = true;
  }

  abrirEditar(doc: Documento): void {
    if (!doc._id) return;
    this.editandoId = doc._id;
    this.archivo = null;
    this.form = {
      categoria: doc.categoria,
      nombre: doc.nombre || '',
      descripcion: doc.descripcion || '',
      conductorId: doc.conductorId || null,
      motoId: doc.motoId || null,
    };
    this.mostrarModal = true;
  }

  esImagen(doc: Documento): boolean {
    const mime = (doc.mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return true;
    return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(doc.url || doc.nombre || '');
  }

  private extensionDesdeMime(mime?: string): string {
    const m = (mime || '').toLowerCase();
    if (m.includes('pdf')) return '.pdf';
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('png')) return '.png';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('word') || m.includes('msword')) return '.doc';
    if (m.includes('officedocument.wordprocessingml')) return '.docx';
    return '';
  }

  private nombreDescarga(doc: Documento): string {
    const base = (doc.nombre || 'documento').trim();
    if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
    return `${base}${this.extensionDesdeMime(doc.mimeType)}`;
  }

  guardar(): void {
    if (!this.form.nombre.trim()) {
      Swal.fire({ icon: 'warning', title: 'El nombre es requerido' });
      return;
    }

    if (this.esEdicion && this.editandoId) {
      this.docs
        .actualizar(this.editandoId, {
          categoria: this.form.categoria,
          nombre: this.form.nombre,
          descripcion: this.form.descripcion,
          conductorId: this.form.conductorId || null,
          motoId: this.form.motoId || null,
        })
        .subscribe({
          next: () => {
            this.cerrarModal();
            this.cargar();
            Swal.fire({
              icon: 'success',
              title: 'Documento actualizado',
              toast: true,
              timer: 1400,
              showConfirmButton: false,
              position: 'top-end',
            });
          },
          error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error al actualizar' }),
        });
      return;
    }

    if (!this.archivo) {
      Swal.fire({ icon: 'warning', title: 'Archivo y nombre requeridos' });
      return;
    }

    this.docs
      .upload({
        file: this.archivo,
        categoria: this.form.categoria,
        nombre: this.form.nombre,
        descripcion: this.form.descripcion,
        conductorId: this.form.conductorId || null,
        motoId: this.form.motoId || null,
      })
      .subscribe({
        next: () => {
          this.cerrarModal();
          this.cargar();
          Swal.fire({
            icon: 'success',
            title: 'Documento subido',
            toast: true,
            timer: 1400,
            showConfirmButton: false,
            position: 'top-end',
          });
        },
        error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error al subir' }),
      });
  }

  async descargar(doc: Documento): Promise<void> {
    try {
      const res = await fetch(doc.url);
      if (!res.ok) throw new Error('No se pudo descargar');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = this.nombreDescarga(doc);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(doc.url, '_blank');
    }
  }

  eliminar(doc: Documento): void {
    if (!doc._id) return;
    Swal.fire({
      title: '¿Eliminar documento?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.docs.eliminar(doc._id!, doc.storagePath).subscribe({
        next: () => this.cargar(),
        error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
      });
    });
  }
}
