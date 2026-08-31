import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { Usuario, CreateUsuarioPayload } from '../../../shared/interfaces/usuario';
import { UsuariosService } from '../../../service/usuarios.service';
import { MotosService } from '../../../service/motos.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.component.html',
  styleUrl: './usuarios.component.css',
})
export class UsuariosComponent implements OnInit {
  mostrarModal = false;
  modoEdicion = false;
  usuarioEditando: Usuario | null = null;
  usuarios: Usuario[] = [];
  conductoresAsignados = new Set<string>();
  mostrarInactivos = true;
  filtroRol: 'todos' | 'empleado' | 'asesor' | 'administrador' = 'todos';
  busqueda = '';
  guardando = false;
  nuevoUsuario: CreateUsuarioPayload = this.formVacio();

  constructor(
    private usuariosService: UsuariosService,
    private motosService: MotosService,
  ) {}

  ngOnInit() {
    this.cargarUsuarios();
  }

  formVacio(): CreateUsuarioPayload {
    return {
      nombre: '',
      apellido: '',
      email: '',
      cedula: 0,
      telefono: '',
      edad: null,
      direccion: '',
      uso: '',
      tiempoContrato: '',
      referencia1: { nombre: '', parentesco: '', telefono: '', direccion: '' },
      referencia2: { nombre: '', parentesco: '', telefono: '', direccion: '' },
      rol: 'empleado',
      activo: true,
      password: '',
    };
  }

  get usuariosFiltrados(): Usuario[] {
    const q = this.busqueda.trim().toLowerCase();
    return this.usuarios.filter((u) => {
      if (!this.mostrarInactivos && !u.activo) return false;
      if (this.filtroRol !== 'todos' && u.rol !== this.filtroRol) return false;
      if (!q) return true;
      return (
        `${u.nombre} ${u.apellido}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        String(u.cedula).includes(q)
      );
    });
  }

  get totalActivos(): number {
    return this.usuarios.filter((u) => u.activo).length;
  }

  get totalConductores(): number {
    return this.usuarios.filter((u) => u.rol === 'empleado').length;
  }

  cargarUsuarios() {
    this.usuariosService.getUsuarios(true).subscribe({
      next: (usuarios) => {
        this.usuarios = usuarios;
        this.motosService.getMotosLista().subscribe({
          next: (motos) => {
            this.conductoresAsignados = new Set(
              motos.map((m) => (typeof m.conductorId === 'string' ? m.conductorId : '')).filter(Boolean),
            );
          },
        });
      },
      error: (error) =>
        Swal.fire({
          icon: 'error',
          title: 'No se pudieron cargar usuarios',
          text: error?.message || '',
        }),
    });
  }

  abrirModal() {
    this.mostrarModal = true;
    this.modoEdicion = false;
    this.usuarioEditando = null;
    this.nuevoUsuario = this.formVacio();
  }

  editarUsuario(usuario: Usuario) {
    this.modoEdicion = true;
    this.usuarioEditando = { ...usuario };
    this.nuevoUsuario = {
      ...this.formVacio(),
      ...usuario,
      rol: usuario.rol === 'conductor' || usuario.rol === 'usuario' ? 'empleado' : usuario.rol,
      referencia1: { ...(usuario.referencia1 || {}) },
      referencia2: { ...(usuario.referencia2 || {}) },
      password: '',
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.modoEdicion = false;
    this.usuarioEditando = null;
    this.nuevoUsuario = this.formVacio();
  }

  guardarUsuario() {
    if (!this.nuevoUsuario.nombre?.trim() || !this.nuevoUsuario.apellido?.trim() || !this.nuevoUsuario.email?.trim()) {
      Swal.fire({ icon: 'warning', title: 'Completa nombre, apellido y email' });
      return;
    }
    if (!this.modoEdicion && (!this.nuevoUsuario.password || this.nuevoUsuario.password.length < 6)) {
      Swal.fire({ icon: 'warning', title: 'Contraseña mínima 6 caracteres' });
      return;
    }
    this.guardando = true;
    if (this.modoEdicion && this.usuarioEditando?._id) {
      const { password, ...patch } = this.nuevoUsuario;
      this.usuariosService.updateUsuario(this.usuarioEditando._id, patch).subscribe({
        next: (u) => {
          this.guardando = false;
          const i = this.usuarios.findIndex((x) => x._id === u._id);
          if (i >= 0) this.usuarios[i] = u;
          this.cerrarModal();
          Swal.fire({ icon: 'success', title: 'Actualizado', toast: true, timer: 1400, showConfirmButton: false, position: 'top-end' });
        },
        error: (e) => {
          this.guardando = false;
          Swal.fire({ icon: 'error', title: e?.message || 'Error' });
        },
      });
      return;
    }
    this.usuariosService.createUsuario(this.nuevoUsuario).subscribe({
      next: (u) => {
        this.guardando = false;
        this.usuarios = [u, ...this.usuarios];
        this.cerrarModal();
        Swal.fire({ icon: 'success', title: 'Usuario creado', toast: true, timer: 1400, showConfirmButton: false, position: 'top-end' });
      },
      error: (e) => {
        this.guardando = false;
        Swal.fire({ icon: 'error', title: e?.message || e?.error?.message || 'Error' });
      },
    });
  }

  eliminarUsuario(usuario: Usuario) {
    if (!usuario._id) return;
    Swal.fire({
      title: '¿Desactivar usuario?',
      text: 'Quedará inactivo; no se borra Auth.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Desactivar',
      confirmButtonColor: '#dc2626',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.usuariosService.deleteUsuario(usuario._id!).subscribe({
        next: (u) => {
          const i = this.usuarios.findIndex((x) => x._id === u._id);
          if (i >= 0) this.usuarios[i] = u;
        },
        error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
      });
    });
  }

  reactivarUsuario(usuario: Usuario) {
    if (!usuario._id) return;
    this.usuariosService.reactivarUsuario(usuario._id).subscribe({
      next: (u) => {
        const i = this.usuarios.findIndex((x) => x._id === u._id);
        if (i >= 0) this.usuarios[i] = u;
      },
    });
  }

  rolLabel(rol: string): string {
    if (rol === 'administrador') return 'Administrador';
    if (rol === 'asesor') return 'Asesor';
    if (rol === 'empleado') return 'Conductor';
    return rol;
  }

  rolClass(rol: string): string {
    if (rol === 'administrador') return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
    if (rol === 'asesor') return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  }

  conductorTieneMoto(id: string): boolean {
    return this.conductoresAsignados.has(id);
  }
}
