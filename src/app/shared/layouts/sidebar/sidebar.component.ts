import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../auth/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css',
})
export class SidebarComponent implements OnInit {
  showSidebar = false;
  userName = 'Usuario';

  constructor(
    private router: Router,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      const storedName = localStorage.getItem('userName');
      if (storedName) this.userName = storedName;
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      this.showSidebar = false;
    }
  }

  toggleSidebar(): void {
    this.showSidebar = !this.showSidebar;
  }

  closeSidebar(): void {
    this.showSidebar = false;
  }

  private go(path: string): void {
    this.closeSidebar();
    this.router.navigate([path]);
  }

  logout(): void {
    this.closeSidebar();
    this.authService.logout();
  }

  goDashboard(): void {
    this.go('/dashboard');
  }
  goMotos(): void {
    this.go('/motos');
  }
  goContratos(): void {
    this.go('/contratos');
  }
  goPlanes(): void {
    this.go('/planes');
  }
  goUsuarios(): void {
    this.go('/usuarios');
  }
  goPagos(): void {
    this.go('/pagos');
  }
  goMantenimientos(): void {
    this.go('/mantenimientos');
  }
  goFlujoCaja(): void {
    this.go('/flujo-caja');
  }
  goHistorial(): void {
    this.go('/history-vehicle');
  }
  goDocumentacion(): void {
    this.go('/documentation');
  }
}
