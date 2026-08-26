import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { FooterComponent } from '../footer/footer/footer.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, HeaderComponent, FooterComponent, SidebarComponent, RouterOutlet],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css'
})
export class LayoutComponent {

    constructor(private router: Router) {}

    showSidebar(): boolean {
    const route = this.router.url.split('?')[0];
    return route !== '/' && route !== '/login' && route !== '/register';
  }

  /** Home, login y register sin header/sidebar/footer del panel. */
  isPublicShell(): boolean {
    const route = this.router.url.split('?')[0];
    return route === '/' || route === '/login' || route === '/register';
  }
}
