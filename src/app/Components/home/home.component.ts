import { Component, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MotosService } from '../../service/motos.service';
import { Moto } from '../../shared/interfaces/moto';
import { WHATSAPP_NUMERO } from '../../shared/constants';
import { WhatsappFloatComponent } from '../../shared/components/whatsapp-float/whatsapp-float.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, WhatsappFloatComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  mdds: Moto[] = [];
  cargando = true;

  constructor(private motosService: MotosService) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      this.cargando = false;
      return;
    }

    this.motosService.getMotos().subscribe({
      next: (list) => {
        this.mdds = list;
        this.cargando = false;
      },
      error: () => {
        this.mdds = [];
        this.cargando = false;
      },
    });
  }

  etiquetaEstado(m: Moto): string {
    switch (m.estado) {
      case 'disponible':
        return 'Disponible';
      case 'en_uso':
        return 'En uso';
      case 'en_mantenimiento':
        return 'En mantenimiento';
      case 'fuera_servicio':
        return 'Fuera de servicio';
      default:
        return m.estado || '';
    }
  }

  whatsapp(): void {
    this.abrirWhatsApp(
      'Hola GoRenting, soy un conductor y quiero información para arrendar una moto.',
    );
  }

  interesMdd(m: Moto, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const nombre = `${m.marca || ''} ${m.modelo || ''}`.trim() || 'moto';
    const placa = m.placa || 'sin placa';
    this.abrirWhatsApp(
      `Hola GoRenting, soy un conductor interesado en la moto ${nombre} con placa ${placa}. ¿Está disponible?`,
    );
  }

  private abrirWhatsApp(mensaje: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const text = encodeURIComponent(mensaje);
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${text}`, '_blank', 'noopener,noreferrer');
  }
}
