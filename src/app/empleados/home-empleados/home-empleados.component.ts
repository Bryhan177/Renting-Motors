import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { UsuariosService } from '../../service/usuarios.service';
import { MotosService } from '../../service/motos.service';
import {
  CobrosService,
  Cobro,
  Abono,
  EstadoCuenta,
} from '../../service/cobros.service';
import { ContratosService, Contrato } from '../../service/contratos.service';
import { DocumentosService, Documento } from '../../service/documentos.service';
import {
  NovedadesService,
  Novedad,
  TipoNovedad,
} from '../../service/novedades.service';
import { Usuario } from '../../shared/interfaces/usuario';
import { Moto } from '../../shared/interfaces/moto';
import { WhatsappFloatComponent } from '../../shared/components/whatsapp-float/whatsapp-float.component';
import { TalleresConfianzaComponent } from '../talleres-confianza/talleres-confianza.component';
import { CurrencyCoDirective } from '../../shared/directives/currency-co.directive';
import { diasHasta, etiquetaVencimiento as formatVencimiento } from '../../shared/date.util';
import { cobroPeriodoVigente, parseDateOnly } from '../../shared/periodo.util';
import Swal from 'sweetalert2';

type SeccionPanel = 'inicio' | 'motos' | 'cuenta' | 'novedades' | 'talleres' | 'documentos' | 'perfil';

@Component({
  selector: 'app-home-empleados',
  standalone: true,
  imports: [CommonModule, FormsModule, WhatsappFloatComponent, CurrencyCoDirective, TalleresConfianzaComponent],
  templateUrl: './home-empleados.component.html',
  styleUrl: './home-empleados.component.css',
})
export class HomeEmpleadosComponent implements OnInit {
  seccion: SeccionPanel = 'inicio';
  cargando = true;
  guardandoPerfil = false;
  enviandoPago = false;
  enviandoNovedad = false;

  usuario: Usuario | null = null;
  motos: Moto[] = [];
  cobros: Cobro[] = [];
  abonos: Abono[] = [];
  documentos: Documento[] = [];
  novedades: Novedad[] = [];
  contrato: Contrato | null = null;
  estadoCuenta: EstadoCuenta = {
    deudaTotal: 0,
    deudaEnMora: 0,
    periodosVencidos: 0,
    enMora: false,
    fechaMoraMasAntigua: null,
  };

  perfilForm = {
    telefono: '',
    direccion: '',
  };

  modalPagoVisible = false;
  pagoForm = {
    cobroId: '',
    monto: 0,
    metodoPago: 'Transferencia',
    comprobanteImagen: null as string | null,
    observaciones: '',
  };

  modalNovedadVisible = false;
  novedadForm = {
    tipo: 'falla' as TipoNovedad,
    titulo: '',
    descripcion: '',
    motoId: '' as string,
    foto: null as string | null,
  };

  readonly navItems: {
    id: SeccionPanel;
    label: string;
    shortLabel?: string;
    icon: string;
  }[] = [
    { id: 'inicio', label: 'Inicio', icon: '📊' },
    { id: 'motos', label: 'Mi moto', icon: '🛵' },
    { id: 'cuenta', label: 'Estado de cuenta', shortLabel: 'Cuenta', icon: '💳' },
    { id: 'novedades', label: 'Novedades', icon: '⚠️' },
    { id: 'talleres', label: 'Talleres', icon: '🔧' },
    { id: 'documentos', label: 'Documentos', shortLabel: 'Docs', icon: '📄' },
    { id: 'perfil', label: 'Mi perfil', shortLabel: 'Perfil', icon: '👤' },
  ];

  constructor(
    private auth: AuthService,
    private usuariosService: UsuariosService,
    private motosService: MotosService,
    private cobrosService: CobrosService,
    private contratosService: ContratosService,
    private documentosService: DocumentosService,
    private novedadesService: NovedadesService,
  ) {}

  ngOnInit() {
    const userId = this.auth.getUserId();
    if (!userId) {
      this.auth.logout();
      return;
    }
    this.cargarTodo(userId);
  }

  get nombreCorto(): string {
    return this.usuario?.nombre || 'Conductor';
  }

  get nombreCompleto(): string {
    if (!this.usuario) return 'Cargando...';
    return `${this.usuario.nombre} ${this.usuario.apellido}`.trim();
  }

  get cobrosPendientes(): Cobro[] {
    return this.cobros.filter((c) => c.saldo > 0 && c.estado !== 'anulado');
  }

  get proximoCobro(): Cobro | null {
    if (this.contrato?._id) {
      const vigente = cobroPeriodoVigente(
        this.cobros,
        this.contrato._id,
        this.contrato.fechaInicio,
        this.contrato.frecuenciaPago || 'semanal',
      );
      if (vigente && vigente.saldo > 0 && vigente.estado !== 'anulado' && vigente.estado !== 'pagado') {
        return vigente;
      }
      return null;
    }
    const pendientes = [...this.cobrosPendientes].sort(
      (a, b) =>
        parseDateOnly(a.fechaVencimiento).getTime() - parseDateOnly(b.fechaVencimiento).getTime(),
    );
    return pendientes[0] || null;
  }

  get motoPrincipal(): Moto | null {
    return this.motos[0] || null;
  }

  get alertasConductor(): { label: string; detalle: string; urgente: boolean }[] {
    const list: { label: string; detalle: string; urgente: boolean }[] = [];
    for (const m of this.motos) {
      const soat = diasHasta(m.soat);
      if (soat !== null && soat <= 15) {
        list.push({
          label: `SOAT · ${m.placa}`,
          detalle: formatVencimiento(m.soat),
          urgente: soat <= 0,
        });
      }
      const tecno = diasHasta(m.tecnomecanica);
      if (tecno !== null && tecno <= 15) {
        list.push({
          label: `Tecnomecánica · ${m.placa}`,
          detalle: formatVencimiento(m.tecnomecanica),
          urgente: tecno <= 0,
        });
      }
    }
    if (this.proximoCobro) {
      const dias = diasHasta(this.proximoCobro.fechaVencimiento);
      if (dias !== null && dias <= 7) {
        list.push({
          label: `Cuota periodo #${this.proximoCobro.numeroPeriodo}`,
          detalle: `${formatVencimiento(this.proximoCobro.fechaVencimiento)} · ${this.formatearMoneda(this.proximoCobro.saldo)}`,
          urgente: dias <= 0 || this.proximoCobro.enMora,
        });
      }
    }
    return list;
  }

  irA(seccion: SeccionPanel) {
    this.seccion = seccion;
  }

  logout() {
    this.auth.logout();
  }

  cargarTodo(userId: string) {
    this.cargando = true;
    forkJoin({
      usuario: this.usuariosService.getUsuario(userId),
      motos: this.motosService.getMotosByConductor(userId).pipe(catchError(() => of([]))),
      cobros: this.cobrosService.getCobros({ conductorId: userId }).pipe(catchError(() => of([]))),
      estado: this.cobrosService.getEstadoCuenta(userId).pipe(
        catchError(() =>
          of({
            deudaTotal: 0,
            deudaEnMora: 0,
            periodosVencidos: 0,
            enMora: false,
            fechaMoraMasAntigua: null,
          } as EstadoCuenta),
        ),
      ),
      abonos: this.cobrosService.getAbonos(undefined, userId).pipe(catchError(() => of([]))),
      docs: this.documentosService.list(undefined, userId).pipe(catchError(() => of([]))),
      contratos: this.contratosService
        .getContratos({ conductorId: userId, estado: 'activo' })
        .pipe(catchError(() => of([]))),
      novedades: this.novedadesService
        .list({ conductorId: userId, conFoto: true })
        .pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ usuario, motos, cobros, estado, abonos, docs, contratos, novedades }) => {
        this.usuario = usuario;
        this.motos = motos;
        this.cobros = cobros;
        this.estadoCuenta = estado;
        this.abonos = abonos;
        this.documentos = docs;
        this.contrato = contratos[0] || null;
        this.novedades = novedades;
        this.perfilForm = {
          telefono: usuario.telefono || '',
          direccion: usuario.direccion || '',
        };
        this.cargando = false;
      },
      error: (e) => {
        this.cargando = false;
        Swal.fire('Error', e?.message || 'No se pudo cargar tu panel', 'error');
      },
    });
  }

  diasPara(fecha?: string | null): number | null {
    return diasHasta(fecha);
  }

  etiquetaVencimiento(fecha?: string | null): string {
    return formatVencimiento(fecha);
  }

  claseVencimiento(fecha?: string | null): string {
    const dias = this.diasPara(fecha);
    if (dias === null) return 'text-gray-400';
    if (dias < 0) return 'text-red-400';
    if (dias <= 15) return 'text-amber-400';
    return 'text-emerald-400';
  }

  formatearFecha(fecha: string | Date): string {
    const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatearMoneda(valor: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(valor || 0);
  }

  etiquetaEstadoCobro(c: Cobro): string {
    if (c.enMora) return 'En mora';
    if (c.estado === 'pagado') return 'Pagado';
    if (c.estado === 'parcial') return 'Parcial';
    return 'Pendiente';
  }

  etiquetaEstadoAbono(a: Abono): string {
    if (a.estado === 'pendiente_confirmacion') return 'Por confirmar';
    if (a.estado === 'registrado') return 'Confirmado';
    return 'Anulado';
  }

  etiquetaCategoria(cat: string): string {
    const map: Record<string, string> = {
      cc_cliente: 'Cédula',
      licencia: 'Licencia',
      contrato_plantilla: 'Contrato',
      matricula_mdd: 'Matrícula',
      tecnomecanica: 'Tecnomecánica',
      soat: 'SOAT',
      formulario: 'Formulario',
      otro: 'Otro',
    };
    return map[cat] || cat;
  }

  abrirModalPago(cobro?: Cobro) {
    const target = cobro || this.proximoCobro || this.cobrosPendientes[0];
    if (!target?._id) {
      Swal.fire(
        'Sin cobros',
        'No tienes periodos pendientes por pagar. Si crees que es un error, contacta a administración.',
        'info',
      );
      return;
    }
    this.pagoForm = {
      cobroId: target._id,
      monto: target.saldo,
      metodoPago: 'Transferencia',
      comprobanteImagen: null,
      observaciones: '',
    };
    this.modalPagoVisible = true;
  }

  cerrarModalPago() {
    this.modalPagoVisible = false;
  }

  onCobroSeleccionado() {
    const cobro = this.cobrosPendientes.find((c) => c._id === this.pagoForm.cobroId);
    if (cobro) this.pagoForm.monto = cobro.saldo;
  }

  onComprobanteSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      Swal.fire('Archivo grande', 'El comprobante debe pesar máximo 4 MB', 'warning');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.pagoForm.comprobanteImagen = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  enviarPago() {
    if (!this.pagoForm.cobroId) {
      Swal.fire('Error', 'Selecciona el periodo a pagar', 'error');
      return;
    }
    if (!this.pagoForm.monto || this.pagoForm.monto <= 0) {
      Swal.fire('Error', 'Ingresa un monto válido', 'error');
      return;
    }
    if (!this.pagoForm.comprobanteImagen) {
      Swal.fire('Error', 'Debes subir el comprobante de pago', 'warning');
      return;
    }

    this.enviandoPago = true;
    this.cobrosService
      .reportarAbono({
        cobroId: this.pagoForm.cobroId,
        monto: this.pagoForm.monto,
        metodoPago: this.pagoForm.metodoPago,
        comprobante: this.pagoForm.comprobanteImagen,
        observaciones: this.pagoForm.observaciones || 'Pago reportado desde panel del conductor',
      })
      .subscribe({
        next: () => {
          this.enviandoPago = false;
          this.modalPagoVisible = false;
          Swal.fire(
            'Enviado',
            'Tu comprobante quedó pendiente de confirmación por administración.',
            'success',
          );
          const userId = this.auth.getUserId();
          if (userId) this.cargarTodo(userId);
        },
        error: (e) => {
          this.enviandoPago = false;
          Swal.fire('Error', e?.error?.message || e?.message || 'No se pudo enviar', 'error');
        },
      });
  }

  guardarPerfil() {
    if (!this.usuario?._id) return;
    if (!this.perfilForm.telefono.trim()) {
      Swal.fire('Error', 'El teléfono es obligatorio', 'error');
      return;
    }
    this.guardandoPerfil = true;
    this.usuariosService
      .updateUsuario(this.usuario._id, {
        telefono: this.perfilForm.telefono.trim(),
        direccion: this.perfilForm.direccion.trim() || null,
      })
      .subscribe({
        next: (u) => {
          this.usuario = u;
          this.guardandoPerfil = false;
          localStorage.setItem('userName', `${u.nombre} ${u.apellido}`.trim());
          Swal.fire('Listo', 'Perfil actualizado', 'success');
        },
        error: (e) => {
          this.guardandoPerfil = false;
          Swal.fire('Error', e?.message || 'No se pudo guardar', 'error');
        },
      });
  }

  abrirModalNovedad() {
    this.novedadForm = {
      tipo: 'falla',
      titulo: '',
      descripcion: '',
      motoId: this.motoPrincipal?._id || '',
      foto: null,
    };
    this.modalNovedadVisible = true;
  }

  cerrarModalNovedad() {
    this.modalNovedadVisible = false;
  }

  onFotoNovedad(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      Swal.fire('Archivo grande', 'La foto debe pesar máximo 4 MB', 'warning');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.novedadForm.foto = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  enviarNovedad() {
    if (!this.novedadForm.titulo.trim() || !this.novedadForm.descripcion.trim()) {
      Swal.fire('Error', 'Completa título y descripción', 'error');
      return;
    }
    this.enviandoNovedad = true;
    this.novedadesService
      .crear({
        tipo: this.novedadForm.tipo,
        titulo: this.novedadForm.titulo,
        descripcion: this.novedadForm.descripcion,
        motoId: this.novedadForm.motoId || null,
        foto: this.novedadForm.foto,
      })
      .subscribe({
        next: () => {
          this.enviandoNovedad = false;
          this.modalNovedadVisible = false;
          Swal.fire('Enviado', 'Tu novedad fue registrada. Administración la verá en el panel.', 'success');
          const userId = this.auth.getUserId();
          if (userId) this.cargarTodo(userId);
        },
        error: (e) => {
          this.enviandoNovedad = false;
          Swal.fire(
            'Error',
            e?.message || e?.error?.message || 'No se pudo enviar. ¿Ejecutaste el SQL de novedades?',
            'error',
          );
        },
      });
  }

  etiquetaTipoNovedad(tipo: string): string {
    const map: Record<string, string> = {
      pinchazo: 'Pinchazo',
      choque: 'Choque',
      falla: 'Falla mecánica',
      documento: 'Documento',
      pago: 'Pago',
      otro: 'Otro',
    };
    return map[tipo] || tipo;
  }

  etiquetaEstadoNovedad(estado: string): string {
    const map: Record<string, string> = {
      abierta: 'Abierta',
      en_proceso: 'En proceso',
      resuelta: 'Resuelta',
      cerrada: 'Cerrada',
    };
    return map[estado] || estado;
  }
}
