import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MotosService } from '../../../service/motos.service';
import { ContratosService, Contrato } from '../../../service/contratos.service';
import { OperacionService, Deposito, Entrega } from '../../../service/operacion.service';
import { PlanesService } from '../../../service/planes.service';
import { Moto } from '../../../shared/interfaces/moto';
import { Usuario } from '../../../shared/interfaces/usuario';
import { Plan } from '../../../shared/interfaces/plan';
import { CurrencyCoDirective } from '../../../shared/directives/currency-co.directive';
import { ContratoWizardComponent } from '../../../shared/components/contrato-wizard/contrato-wizard.component';
import { ContratoWizardForm, formularioListoParaCrear, planDeFormulario } from '../../../shared/contrato-wizard';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-motos',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective, ContratoWizardComponent],
  templateUrl: './motos.component.html',
  styleUrl: './motos.component.css',
})
export class MotosComponent implements OnInit {
  motos: Moto[] = [];
  conductoresDisponibles: Usuario[] = [];
  modalVisible = false;
  modalAsignarVisible = false;
  motoSeleccionada: Moto | null = null;
  motoForm: Moto = this.formVacio();
  formularioInvalido = false;
  isEditing = false;
  editingId: string | null = null;
  /** Al crear MDD: null = sin conductor por ahora */
  conductorCreacion: string | 'sin_conductor' = 'sin_conductor';
  diasPico = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', '0-1', '2-3', '4-5', '6-7', '8-9'];

  formVacio(): Moto {
    return {
      marca: '',
      modelo: '',
      placa: '',
      precio: 0,
      precioCompra: 0,
      precioCobro: 180000,
      soat: null,
      tecnomecanica: null,
      aceite: '',
      transitoMatricula: '',
      fechaIngreso: new Date().toISOString().slice(0, 10),
      picoYPlaca: '',
      cilindraje: null,
      color: '',
      anio: null,
      tieneMultas: false,
      uso: 'flota',
      modalidad: 'arriendo',
      estado: 'disponible',
      conductorId: null,
      imagen: undefined,
    };
  }
  pasoAsignar = 1;
  contratoActual: Contrato | null = null;
  entregaForm = this.entregaVacia();
  entregaId: string | null = null;
  sugerencias = { accesorios: [] as string[], documentos: [] as string[] };
  planes: Plan[] = [];
  guardandoContrato = false;

  modalDevolverVisible = false;
  devolucionForm: any = null;
  devolucionId: string | null = null;
  entregaSnapshot: Entrega | null = null;

  modalDepositoVisible = false;
  depositoInfo: Deposito | null = null;
  depositoMovimientos: Array<{ tipo: string; monto: number; estado: string }> = [];
  depositoMonto = 0;
  depositoMetodo = 'TRANSFERENCIA';
  liquidarMotivo = '';
  liquidarDecision: 'devolver_completo' | 'devolver_parcial' | 'retener' = 'devolver_completo';
  liquidarMontoDevolver = 0;
  liquidarMontoRetener = 0;

  constructor(
    private motosService: MotosService,
    private contratosService: ContratosService,
    private operacionService: OperacionService,
    private planesService: PlanesService,
  ) {}

  ngOnInit(): void {
    this.loadMotos();
    this.loadConductoresDisponibles();
  }

  loadMotos(): void {
    this.motosService.getMotos().subscribe({
      next: (motos) => (this.motos = motos),
      error: (error) =>
        Swal.fire({
          icon: 'error',
          title: 'Error al cargar motos',
          text: error?.message || error?.error?.message || '',
          toast: true,
          timer: 2500,
          showConfirmButton: false,
          position: 'top-end',
        }),
    });
  }

  loadConductoresDisponibles(): void {
    this.motosService.getConductoresDisponibles().subscribe({
      next: (c) => (this.conductoresDisponibles = c),
      error: () => {},
    });
  }

  agregarMoto() {
    if (!this.motoForm.marca.trim() || !this.motoForm.modelo.trim() || !this.motoForm.placa.trim()) {
      this.formularioInvalido = true;
      return;
    }
    this.formularioInvalido = false;
    const payload: Moto = {
      ...this.motoForm,
      precio: Number(this.motoForm.precioCompra ?? this.motoForm.precio) || 0,
      precioCompra: Number(this.motoForm.precioCompra ?? this.motoForm.precio) || 0,
      precioCobro: Number(this.motoForm.precioCobro) || 180000,
      conductorId:
        this.conductorCreacion === 'sin_conductor' ? null : this.conductorCreacion || null,
      estado:
        this.conductorCreacion !== 'sin_conductor' && this.conductorCreacion
          ? 'en_uso'
          : this.motoForm.estado || 'disponible',
    };
    this.motosService.createMoto(payload).subscribe({
      next: () => {
        this.loadMotos();
        this.cerrarModal();
        Swal.fire({
          icon: 'success',
          title: 'MDD registrada',
          toast: true,
          timer: 1500,
          showConfirmButton: false,
          position: 'top-end',
        });
      },
      error: (e) =>
        Swal.fire({
          icon: 'error',
          title: e?.message || e?.error?.message || 'Error al crear',
        }),
    });
  }

  abrirModalAsignar(moto: Moto) {
    this.motoSeleccionada = moto;
    this.modalAsignarVisible = true;
    this.pasoAsignar = 1;
    this.guardandoContrato = false;
    this.contratoActual = null;
    this.entregaId = null;
    this.entregaForm = this.entregaVacia();
    this.loadConductoresDisponibles();
    this.planesService.getActivos().subscribe({
      next: (p) => (this.planes = p),
      error: () => {
        this.planes = [];
        Swal.fire({
          icon: 'warning',
          title: 'No se pudieron cargar planes',
          text: 'Ejecuta el SQL 20260828_planes_catalogo.sql en Supabase.',
        });
      },
    });
    this.operacionService.sugerencias().subscribe({
      next: (s) => (this.sugerencias = s),
    });
  }

  cerrarModalAsignar() {
    this.modalAsignarVisible = false;
    this.motoSeleccionada = null;
    this.pasoAsignar = 1;
    this.guardandoContrato = false;
  }

  crearContratoYContinuar(payload: ContratoWizardForm) {
    if (!this.motoSeleccionada?._id) {
      Swal.fire({ icon: 'error', title: 'Selecciona una moto' });
      return;
    }
    const datos: ContratoWizardForm = { ...payload, motoId: this.motoSeleccionada._id };
    const plan = planDeFormulario(this.planes, datos);
    const check = formularioListoParaCrear(datos, plan, { omitirMoto: true });
    if (!check.ok) {
      Swal.fire({ icon: 'warning', title: check.mensaje || 'Completa los pasos del contrato' });
      return;
    }
    this.guardandoContrato = true;
    this.contratosService.create(datos).subscribe({
      next: (contrato) => {
        this.contratoActual = contrato;
        this.pasoAsignar = 2;
        this.guardandoContrato = false;
        this.prefillAccesorios();
      },
      error: (e) => {
        this.guardandoContrato = false;
        Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'No se pudo crear el contrato' });
      },
    });
  }

  prefillAccesorios() {
    if (!this.entregaForm.accesorios.length) {
      this.entregaForm.accesorios = this.sugerencias.accesorios.map((nombre) => ({
        nombre,
        cantidad: 1,
        entregado: true,
      }));
    }
    if (!this.entregaForm.documentos.length) {
      this.entregaForm.documentos = this.sugerencias.documentos.map((tipo) => ({ tipo, entregado: true }));
    }
  }

  agregarAccesorio(nombre: string) {
    if (!nombre.trim()) return;
    this.entregaForm.accesorios.push({ nombre: nombre.trim(), cantidad: 1, entregado: true });
  }

  agregarDocumento(tipo: string) {
    if (!tipo.trim()) return;
    this.entregaForm.documentos.push({ tipo: tipo.trim(), entregado: true });
  }

  agregarDano(descripcion: string) {
    if (!descripcion.trim()) return;
    this.entregaForm.danosPreexistentes.push({ descripcion: descripcion.trim() });
  }

  guardarBorradorEntrega(confirmar = false) {
    if (!this.contratoActual?._id) return;
    this.operacionService.guardarEntrega(this.contratoActual._id, this.entregaForm).subscribe({
      next: (entrega) => {
        this.entregaId = entrega._id || null;
        if (confirmar && this.entregaId) this.ejecutarConfirmacionEntrega();
        else {
          Swal.fire({
            icon: 'success',
            title: 'Borrador de entrega guardado',
            text: 'El contrato sigue en borrador.',
            toast: true,
            timer: 2000,
            showConfirmButton: false,
            position: 'top-end',
          });
        }
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'Error' }),
    });
  }

  confirmarEntrega() {
    this.guardarBorradorEntrega(true);
  }

  private ejecutarConfirmacionEntrega() {
    if (!this.entregaId) return;
    this.operacionService.confirmarEntrega(this.entregaId).subscribe({
      next: (res) => {
        const pendiente = res.deposito?.saldoPendiente || 0;
        this.loadMotos();
        this.loadConductoresDisponibles();
        this.cerrarModalAsignar();
        Swal.fire({
          icon: pendiente > 0 ? 'warning' : 'success',
          title: 'Entrega confirmada. Contrato activo.',
          text: pendiente > 0 ? `Depósito pendiente: $${pendiente.toLocaleString()}` : 'Depósito completo.',
        });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'No se pudo confirmar' }),
    });
  }

  abrirDevolver(moto: Moto) {
    this.motoSeleccionada = moto;
    this.contratosService.getContratos({ estado: 'activo', motoId: moto._id }).subscribe({
      next: (contratos) => {
        const contrato = contratos[0];
        if (!contrato?._id) {
          Swal.fire({ icon: 'error', title: 'No hay contrato activo' });
          return;
        }
        this.contratoActual = contrato;
        this.operacionService.getEntrega(contrato._id).subscribe({
          next: (entrega) => {
            if (!entrega || entrega.estado !== 'confirmada') {
              Swal.fire({ icon: 'error', title: 'Sin entrega confirmada' });
              return;
            }
            this.entregaSnapshot = entrega;
            this.devolucionForm = {
              kilometraje: entrega.kilometraje,
              nivelCombustible: entrega.nivelCombustible,
              estadoGeneral: entrega.estadoGeneral,
              observaciones: '',
              accesorios: (entrega.accesorios || []).map((a) => ({ ...a, devuelto: a.entregado })),
              documentos: (entrega.documentos || []).map((d) => ({ ...d, devuelto: d.entregado })),
              danosEncontrados: (entrega.danosPreexistentes || []).map((d) => ({
                descripcion: d.descripcion,
                zona: d.zona,
                preexistente: true,
              })),
              evidencias: [],
              condicionMoto: 'disponible',
            };
            this.modalDevolverVisible = true;
          },
          error: () => Swal.fire({ icon: 'error', title: 'No se pudo cargar la entrega' }),
        });
      },
    });
  }

  guardarBorradorDevolucion(confirmar = false) {
    if (!this.contratoActual?._id) return;
    this.operacionService.guardarDevolucion(this.contratoActual._id, this.devolucionForm).subscribe({
      next: (dev) => {
        this.devolucionId = dev._id || null;
        if (confirmar && this.devolucionId) this.ejecutarConfirmacionDevolucion();
        else {
          Swal.fire({
            icon: 'success',
            title: 'Borrador de devolución guardado',
            toast: true,
            timer: 2000,
            showConfirmButton: false,
            position: 'top-end',
          });
        }
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'Error' }),
    });
  }

  confirmarDevolucion() {
    this.guardarBorradorDevolucion(true);
  }

  private ejecutarConfirmacionDevolucion() {
    if (!this.devolucionId) return;
    this.operacionService.confirmarDevolucion(this.devolucionId).subscribe({
      next: () => {
        this.modalDevolverVisible = false;
        this.loadMotos();
        this.loadConductoresDisponibles();
        Swal.fire({
          icon: 'success',
          title: 'Devolución confirmada',
          text: 'Contrato finalizado. Depósito en liquidación.',
        });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'Error' }),
    });
  }

  abrirDeposito(moto: Moto) {
    this.motoSeleccionada = moto;
    this.contratosService.getContratos({ motoId: moto._id }).subscribe({
      next: (contratos) => {
        const contrato =
          contratos.find((c) => c.estado === 'activo' || c.estado === 'finalizado') || contratos[0];
        if (!contrato?._id) {
          Swal.fire({ icon: 'error', title: 'No hay contrato para esta moto' });
          return;
        }
        this.contratoActual = contrato;
        this.operacionService.getDeposito(contrato._id).subscribe({
          next: (res) => {
            this.depositoInfo = res.deposito;
            this.depositoMovimientos = res.movimientos || [];
            this.depositoMonto = res.deposito.saldoPendiente || 0;
            this.liquidarMotivo = '';
            this.liquidarDecision = 'devolver_completo';
            this.liquidarMontoDevolver = res.deposito.saldoEnCustodia || 0;
            this.liquidarMontoRetener = 0;
            this.modalDepositoVisible = true;
          },
          error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || 'No se pudo cargar depósito' }),
        });
      },
    });
  }

  registrarRecepcionDeposito() {
    if (!this.depositoInfo?._id) return;
    this.operacionService
      .registrarRecepcion(this.depositoInfo._id, {
        monto: this.depositoMonto,
        metodoPago: this.depositoMetodo,
      })
      .subscribe({
        next: (res: any) => {
          this.depositoInfo = res.deposito;
          this.depositoMonto = res.deposito.saldoPendiente || 0;
          if (this.contratoActual?._id) {
            this.operacionService.getDeposito(this.contratoActual._id).subscribe({
              next: (full) => (this.depositoMovimientos = full.movimientos || []),
            });
          }
          Swal.fire({ icon: 'success', title: 'Recepción registrada', toast: true, timer: 1500, showConfirmButton: false, position: 'top-end' });
        },
        error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'Error' }),
      });
  }

  onCambioDecisionLiquidacion() {
    const custodia = this.depositoInfo?.saldoEnCustodia || 0;
    if (this.liquidarDecision === 'devolver_completo') {
      this.liquidarMontoDevolver = custodia;
      this.liquidarMontoRetener = 0;
    } else if (this.liquidarDecision === 'retener') {
      this.liquidarMontoDevolver = 0;
      this.liquidarMontoRetener = custodia;
    }
  }

  liquidarDeposito() {
    if (!this.depositoInfo?._id) return;
    if (!this.liquidarMotivo.trim()) {
      Swal.fire({ icon: 'error', title: 'Motivo obligatorio' });
      return;
    }
    const payload: any = {
      decision: this.liquidarDecision,
      motivo: this.liquidarMotivo.trim(),
    };
    if (this.liquidarDecision === 'devolver_parcial') {
      payload.montoADevolver = Number(this.liquidarMontoDevolver) || 0;
      payload.montoARetener = Number(this.liquidarMontoRetener) || 0;
    }
    this.operacionService.liquidar(this.depositoInfo._id, payload).subscribe({
      next: (dep: Deposito) => {
        this.depositoInfo = dep;
        Swal.fire({ icon: 'success', title: 'Depósito liquidado' });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.error?.message || e?.message || 'Error' }),
    });
  }

  private entregaVacia() {
    return {
      kilometraje: 0,
      nivelCombustible: '1/2',
      estadoGeneral: 'bueno',
      observaciones: '',
      accesorios: [] as Array<{ nombre: string; cantidad: number; entregado: boolean }>,
      documentos: [] as Array<{ tipo: string; entregado: boolean }>,
      danosPreexistentes: [] as Array<{ descripcion: string }>,
      evidencias: [] as string[],
    };
  }

  abrirModal(moto: Moto | null = null) {
    this.loadConductoresDisponibles();
    if (moto) {
      this.motoForm = { ...this.formVacio(), ...moto };
      this.isEditing = true;
      this.editingId = moto._id!;
      this.conductorCreacion = moto.conductorId || 'sin_conductor';
    } else {
      this.resetForm();
    }
    this.modalVisible = true;
  }

  cerrarModal() {
    this.modalVisible = false;
    this.resetForm();
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => (this.motoForm.imagen = e.target.result);
    reader.readAsDataURL(file);
  }

  editarMoto() {
    if (!this.editingId) return;
    const payload: Partial<Moto> = {
      ...this.motoForm,
      precio: Number(this.motoForm.precioCompra ?? this.motoForm.precio) || 0,
      precioCompra: Number(this.motoForm.precioCompra ?? this.motoForm.precio) || 0,
      conductorId:
        this.conductorCreacion === 'sin_conductor' ? null : this.conductorCreacion || null,
    };
    this.motosService.updateMoto(this.editingId, payload).subscribe({
      next: () => {
        this.loadMotos();
        this.cerrarModal();
        Swal.fire({
          icon: 'success',
          title: 'MDD actualizada',
          toast: true,
          timer: 1500,
          showConfirmButton: false,
          position: 'top-end',
        });
      },
      error: (e) => Swal.fire({ icon: 'error', title: e?.message || 'Error' }),
    });
  }

  eliminarMoto(id: string) {
    Swal.fire({
      title: '¿Eliminar moto?',
      text: 'Se borrarán también contratos en borrador/finalizados y su historial. No se puede si hay contrato activo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b91c1c',
    }).then((r) => {
      if (!r.isConfirmed) return;
      this.motosService.deleteMoto(id).subscribe({
        next: () => {
          this.loadMotos();
          Swal.fire({
            icon: 'success',
            title: 'Eliminada',
            toast: true,
            timer: 1500,
            showConfirmButton: false,
            position: 'top-end',
          });
        },
        error: (e) =>
          Swal.fire({
            icon: 'error',
            title: 'No se pudo eliminar',
            text: e?.message || e?.error?.message || 'Error',
          }),
      });
    });
  }

  getEstadoClass(estado: string): string {
    switch (estado) {
      case 'disponible':
        return 'bg-green-500/20 text-green-400 border border-green-500/30';
      case 'en_uso':
        return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
      case 'en_mantenimiento':
        return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
      case 'fuera_servicio':
        return 'bg-red-500/20 text-red-400 border border-red-500/30';
      default:
        return 'bg-gray-700 text-gray-400';
    }
  }

  getEstadoText(estado: string): string {
    switch (estado) {
      case 'disponible':
        return 'Disponible';
      case 'en_uso':
        return 'En Uso';
      case 'en_mantenimiento':
        return 'Mantenimiento';
      case 'fuera_servicio':
        return 'Fuera Servicio';
      default:
        return estado;
    }
  }

  countMotosByState(estado: string): number {
    return this.motos.filter((m) => m.estado === estado).length;
  }

  private resetForm() {
    this.motoForm = this.formVacio();
    this.conductorCreacion = 'sin_conductor';
    this.isEditing = false;
    this.editingId = null;
  }
}
