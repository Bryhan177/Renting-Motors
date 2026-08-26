import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TalleresService } from '../../service/talleres.service';
import { TallerConfianza, serviciosLista } from '../../shared/interfaces/taller-confianza';
import {
  GeoPoint,
  formatDistanciaKm,
  googleMapsDirectionsUrl,
  ordenarPorCercania,
  osmEmbedUrl,
  osmMapUrl,
  puntoDe,
} from '../../shared/taller-geo';

export type ModoTalleresConductor = 'completo' | 'resumen';

@Component({
  selector: 'app-talleres-confianza',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './talleres-confianza.component.html',
})
export class TalleresConfianzaComponent implements OnInit {
  @Input() modo: ModoTalleresConductor = 'completo';
  @Output() verTodos = new EventEmitter<void>();

  talleres: TallerConfianza[] = [];
  cargando = false;
  errorSql = false;
  ubicacion: GeoPoint | null = null;
  geoEstado: 'pendiente' | 'ok' | 'denegado' | 'no-soportado' = 'pendiente';
  mapaSeleccionadoId: string | null = null;
  embedCache = new Map<string, SafeResourceUrl>();

  constructor(
    private talleresService: TalleresService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  get listado(): TallerConfianza[] {
    if (this.ubicacion) {
      return ordenarPorCercania(this.talleres, this.ubicacion);
    }
    return this.talleres;
  }

  get visibles(): TallerConfianza[] {
    if (this.modo === 'resumen') return this.listado.slice(0, 3);
    return this.listado;
  }

  get masCercano(): TallerConfianza | null {
    if (!this.ubicacion || !this.listado.length) return null;
    return this.listado[0];
  }

  cargar(): void {
    this.cargando = true;
    this.errorSql = false;
    this.talleresService.getActivos().subscribe({
      next: (talleres) => {
        this.talleres = talleres;
        this.cargando = false;
        if (this.modo === 'completo' && talleres[0]?._id) {
          this.mapaSeleccionadoId = talleres[0]._id!;
        }
      },
      error: () => {
        this.cargando = false;
        this.errorSql = true;
        this.talleres = [];
      },
    });
  }

  pedirUbicacion(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) {
      this.geoEstado = 'no-soportado';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.ubicacion = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        this.geoEstado = 'ok';
        const cercano = this.masCercano;
        if (cercano?._id) this.mapaSeleccionadoId = cercano._id;
      },
      () => {
        this.geoEstado = 'denegado';
        this.ubicacion = null;
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120000 },
    );
  }

  distanciaDe(taller: TallerConfianza): string {
    if (!this.ubicacion) return '';
    const ranked = ordenarPorCercania([taller], this.ubicacion)[0];
    if (!ranked || !Number.isFinite(ranked.distanciaKm)) return '';
    return formatDistanciaKm(ranked.distanciaKm);
  }

  esMasCercano(taller: TallerConfianza): boolean {
    return !!this.masCercano && this.masCercano._id === taller._id;
  }

  chips(taller: TallerConfianza): string[] {
    return serviciosLista(taller.servicios);
  }

  pinUrl(taller: TallerConfianza): string | null {
    const p = puntoDe(taller);
    return p ? osmMapUrl(p) : null;
  }

  comoLlegarUrl(taller: TallerConfianza): string | null {
    const p = puntoDe(taller);
    return p ? googleMapsDirectionsUrl(p, this.ubicacion) : null;
  }

  embedDe(taller: TallerConfianza): SafeResourceUrl | null {
    const p = puntoDe(taller);
    if (!p || !taller._id) return null;
    const cached = this.embedCache.get(taller._id);
    if (cached) return cached;
    const url = this.sanitizer.bypassSecurityTrustResourceUrl(osmEmbedUrl(p));
    this.embedCache.set(taller._id, url);
    return url;
  }

  mostrarMapa(taller: TallerConfianza): void {
    this.mapaSeleccionadoId = taller._id || null;
  }

  mapaVisible(taller: TallerConfianza): boolean {
    return this.modo === 'completo' && this.mapaSeleccionadoId === taller._id;
  }
}
