import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
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
  mdds: Moto[] = [];
  cargando = true;
  /** ids cuya foto http falló (onerror). */
  private fotosRotas = new Set<string>();

  constructor(
    private motosService: MotosService,
    @Inject(PLATFORM_ID) private platformId: object,
  ) {}

  ngOnInit(): void {
    // SSR prerender of `/` must keep the same first paint as the browser
    // (`cargando === true`). Flipping it to false here produced a hydration
    // mismatch: two fleet cards painted as black voids with only the static
    // WhatsApp hint. Fetch only in the browser after hydrate.
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.motosService.getMotosPublicas().subscribe({
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

  tituloMdd(m: Moto): string {
    return `${m.marca || ''} ${m.modelo || ''}`.trim() || 'Moto';
  }

  placaMdd(m: Moto): string {
    return (m.placa || '').trim() || 'Sin placa';
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
        return m.estado || 'Sin estado';
    }
  }

  fotoSrc(m: Moto): string | null {
    const src = (m.imagen || '').trim();
    if (!src || /^data:/i.test(src)) return null;
    const key = m._id || m.placa || src;
    if (this.fotosRotas.has(key)) return null;
    return src;
  }

  mostrarFoto(m: Moto): boolean {
    return !!this.fotoSrc(m);
  }

  onFotoError(m: Moto): void {
    const key = m._id || m.placa || m.imagen || '';
    if (key) this.fotosRotas.add(key);
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
