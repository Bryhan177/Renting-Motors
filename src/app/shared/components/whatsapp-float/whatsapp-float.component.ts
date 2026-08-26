import { Component, Input, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { WHATSAPP_MENSAJE_DEFAULT, WHATSAPP_NUMERO } from '../../constants';

@Component({
  selector: 'app-whatsapp-float',
  standalone: true,
  templateUrl: './whatsapp-float.component.html',
  styleUrl: './whatsapp-float.component.css',
})
export class WhatsappFloatComponent {
  private platformId = inject(PLATFORM_ID);

  /** Mensaje precargado al abrir el chat. */
  @Input() mensaje = WHATSAPP_MENSAJE_DEFAULT;

  /** Etiqueta accesible del botón. */
  @Input() label = 'Escribir por WhatsApp';

  abrir(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const text = encodeURIComponent(this.mensaje || WHATSAPP_MENSAJE_DEFAULT);
    window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${text}`, '_blank', 'noopener,noreferrer');
  }
}
