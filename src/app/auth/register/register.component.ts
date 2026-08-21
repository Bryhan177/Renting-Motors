import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { AuthService, AuthResponse } from '../auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  nuevoUsuario = {
    nombre: '',
    apellido: '',
    email: '',
    cedula: 0 as number | null,
    telefono: '',
    edad: null as number | null,
    activo: true,
    password: '',
    confirmPassword: '',
  };

  constructor(private authService: AuthService) {}

  agregarUsuario() {
    if (
      !this.nuevoUsuario.nombre?.trim() ||
      !this.nuevoUsuario.apellido?.trim() ||
      !this.nuevoUsuario.email?.trim() ||
      !this.nuevoUsuario.telefono?.trim()
    ) {
      Swal.fire({
        icon: 'error',
        title: 'Campos incompletos',
        text: 'Nombre, apellido, correo y teléfono son obligatorios',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
      });
      return;
    }

    const cedulaNum = Number(this.nuevoUsuario.cedula);
    if (!cedulaNum || Number.isNaN(cedulaNum) || cedulaNum <= 0) {
      Swal.fire({
        icon: 'error',
        title: 'Cédula inválida',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
      });
      return;
    }

    const edad = Number(this.nuevoUsuario.edad);
    if (!edad || edad < 18 || edad > 90) {
      Swal.fire({
        icon: 'error',
        title: 'Edad inválida',
        text: 'Debes indicar una edad entre 18 y 90 años',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2200,
      });
      return;
    }

    if (!this.nuevoUsuario.password || this.nuevoUsuario.password.length < 8) {
      Swal.fire({
        icon: 'error',
        title: 'Contraseña inválida',
        text: 'Mínimo 8 caracteres',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
      });
      return;
    }

    if (this.nuevoUsuario.password !== this.nuevoUsuario.confirmPassword) {
      Swal.fire({
        icon: 'error',
        title: 'Contraseñas no coinciden',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
      });
      return;
    }

    if (!this.nuevoUsuario.activo) {
      Swal.fire({
        icon: 'warning',
        title: 'Debes aceptar los términos',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
      });
      return;
    }

    // Rol fijo: conductor. Admin/asesor lo cambian en el panel.
    const payload = {
      nombre: this.nuevoUsuario.nombre.trim(),
      apellido: this.nuevoUsuario.apellido.trim(),
      email: this.nuevoUsuario.email.trim(),
      cedula: cedulaNum,
      telefono: String(this.nuevoUsuario.telefono),
      edad,
      rol: 'empleado' as const,
      activo: true,
      password: this.nuevoUsuario.password,
    };

    this.authService.register(payload).subscribe({
      next: (res: AuthResponse) => {
        this.nuevoUsuario = {
          nombre: '',
          apellido: '',
          email: '',
          cedula: 0,
          telefono: '',
          edad: null,
          activo: true,
          password: '',
          confirmPassword: '',
        };
        Swal.fire({
          icon: 'success',
          title: 'Cuenta creada',
          text: 'Quedas como conductor. El equipo puede ajustar tu rol en Usuarios.',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2800,
        }).then(() => this.authService.redirectByRole(res.usuario.rol));
      },
      error: (error: any) => {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.error?.message || 'No se pudo crear la cuenta',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
        });
      },
    });
  }
}
