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
    { id: 'otro', label: 'Otros' },
  ];

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

  abrirSubir(): void {
    this.form = {
      categoria: 'contrato_plantilla',
      nombre: '',
      descripcion: '',
      conductorId: null,
      motoId: null,
    };
    this.archivo = null;
    this.mostrarModal = true;
  }

  subir(): void {
    if (!this.archivo || !this.form.nombre.trim()) {
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
          this.mostrarModal = false;
          this.cargar();
          Swal.fire({ icon: 'success', title: 'Documento subido', toast: true, timer: 1400, showConfirmButton: false, position: 'top-end' });
        },
        error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error al subir' }),
      });
  }

  descargar(doc: Documento): void {
    window.open(doc.url, '_blank');
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
