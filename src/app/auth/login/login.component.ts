import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { AuthService, AuthResponse } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  error: string = '';

  constructor(private authService: AuthService) {}

  onLogin() {
    if (!this.email || !this.password) {
      this.error = 'Por favor, ingrese correo y contraseña';
      return;
    }

    this.authService.login(this.email, this.password).subscribe({
      next: (res: AuthResponse) => {
        Swal.fire({
          icon: 'success',
          title: 'Bienvenido',
          text: `Has iniciado sesión como ${res.usuario.nombre}`,
          timer: 2000,
          showConfirmButton: false,
        }).then(() => this.authService.redirectByRole(res.usuario.rol));
      },
      error: (err: any) => {
        this.error = 'Credenciales inválidas o error en el sistema';
        Swal.fire({
          icon: 'error',
          title: 'Error de inicio de sesión',
          text: err.error?.message || 'No se pudo iniciar sesión',
          timer: 3000,
        });
      },
    });
  }

  goToRegister() {
    window.location.href = '/register';
  }

  goHome() {
    window.location.href = '/';
  }
}
