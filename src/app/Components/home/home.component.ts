import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MotosService } from '../../service/motos.service';
import { Moto } from '../../shared/interfaces/moto';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  mdds: Moto[] = [];

  constructor(private motosService: MotosService) {}

  ngOnInit(): void {
    // Evita timeout de SSR/prerender: Supabase solo en el navegador
    if (!isPlatformBrowser(this.platformId)) return;

    this.motosService.getMotos().subscribe({
      next: (list) => {
        this.mdds = list
          .filter((m) => m.estado === 'disponible' || !m.conductorId)
          .slice(0, 6);
      },
      error: () => {
        this.mdds = [];
      },
    });
  }

  whatsapp(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const telefono = '573116433560';
    const mensaje = encodeURIComponent(
      'Hola GoRenting, quiero información para operar una MDD (Máquina de Dinero).',
    );
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  }
}
