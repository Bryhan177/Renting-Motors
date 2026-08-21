import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../auth/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})

export class SidebarComponent implements OnInit {
  showSidebar: boolean = false;
  userName: string = 'Usuario';

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit() {
    // Si estamos en el lado del cliente (para evitar errores en SSR)
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedName = localStorage.getItem('userName');
      if (storedName) {
        this.userName = storedName;
      }
    }
  }

  logout() {
    this.authService.logout();
  }
  goDashboard() {
    this.router.navigate(['/dashboard']);
  }
  goMotos() {
    this.router.navigate(['/motos']);
  }
  goUsuarios() {
    this.router.navigate(['/usuarios']);
  }
  goPagos() {
    this.router.navigate(['/pagos']);
  }
  goMantenimientos() {
    this.router.navigate(['/mantenimientos']);
  }
  goFlujoCaja() {
    this.router.navigate(['/flujo-caja']);
  }
  goHistorial() {
    this.router.navigate(['/history-vehicle']);
  }
  goDocumentacion() {
    this.router.navigate(['/documentation']);
  }
  toggleSidebar() {
    this.showSidebar = !this.showSidebar;
  }
}

