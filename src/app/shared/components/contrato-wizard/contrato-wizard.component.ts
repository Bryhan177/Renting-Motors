import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { Moto } from '../../interfaces/moto';
import { Plan } from '../../interfaces/plan';
import { Usuario } from '../../interfaces/usuario';
import { CurrencyCoDirective } from '../../directives/currency-co.directive';
import { FrecuenciaPago } from '../../periodo.util';
import { etiquetaMoto, labelFrecuencia, nombreConductor } from '../../contrato.rules';
import {
  ContratoWizardForm,
  ContratoWizardPasoId,
  aplicarCambioDuracion,
  aplicarCambioFrecuencia,
  aplicarCambioInicio,
  aplicarCambioPlan,
  duracionMinimaDelPlan,
  etiquetaOpcionPlan,
  etiquetaPaso,
  fechaCortaWizard,
  formWizardVacio,
  formularioListoParaCrear,
  frecuenciasDelPlan,
  invalidarPosteriores,
  labelCuotaPactada,
  payloadDesdeForm,
  pasosDelWizard,
  permiteNegociarValor,
  planDeFormulario,
  puedeAvanzar,
  puedeCrearBorrador,
  puedeIrAPaso,
  resumenContrato,
  visitar,
} from '../../contrato-wizard';

@Component({
  selector: 'app-contrato-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyCoDirective],
  templateUrl: './contrato-wizard.component.html',
  host: { class: 'flex flex-col min-h-0 flex-1' },
})
export class ContratoWizardComponent implements OnInit, OnChanges {
  @Input() conductores: Usuario[] = [];
  @Input() motos: Moto[] = [];
  @Input() planes: Plan[] = [];
  /** Si Motos ya eligió la MDD, se omite el paso moto. */
  @Input() motoFija: Moto | null = null;
  @Input() guardando = false;
  @Input() confirmLabel = 'Crear borrador';

  @Output() cancelar = new EventEmitter<void>();
  @Output() crear = new EventEmitter<ContratoWizardForm>();

  form: ContratoWizardForm = formWizardVacio();
  pasoIndex = 0;
  visitados: ContratoWizardPasoId[] = [];

  ngOnInit(): void {
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['motoFija'] && this.form) {
      this.form.motoId = this.motoFija?._id || this.form.motoId;
    }
  }

  reset(): void {
    this.form = formWizardVacio(this.motoFija?._id || '');
    this.pasoIndex = 0;
    this.visitados = [];
  }

  get omitirMoto(): boolean {
    return !!this.motoFija;
  }

  get planSeleccionado(): Plan | null {
    return planDeFormulario(this.planes, this.form);
  }

  get pasos(): ContratoWizardPasoId[] {
    return pasosDelWizard(this.planSeleccionado, { omitirMoto: this.omitirMoto });
  }

  get pasoActual(): ContratoWizardPasoId {
    return this.pasos[this.pasoIndex] || this.pasos[0];
  }

  get esResumen(): boolean {
    return this.pasoActual === 'resumen';
  }

  get frecuencias(): FrecuenciaPago[] {
    return frecuenciasDelPlan(this.planSeleccionado);
  }

  get permiteNegociar(): boolean {
    return permiteNegociarValor(this.planSeleccionado);
  }

  get minDuracion(): number {
    return duracionMinimaDelPlan(this.planSeleccionado);
  }

  get lineasResumen() {
    const conductor = this.conductores.find((c) => c._id === this.form.conductorId) || null;
    const moto =
      this.motoFija || this.motos.find((m) => m._id === this.form.motoId) || null;
    return resumenContrato(this.form, this.planSeleccionado, conductor, moto);
  }

  etiqueta(paso: ContratoWizardPasoId): string {
    return etiquetaPaso(paso);
  }

  etiquetaPlanCard(p: Plan): string {
    return etiquetaOpcionPlan(p);
  }

  labelFrecuencia(f: FrecuenciaPago): string {
    return labelFrecuencia(f);
  }

  labelCuota(): string {
    return labelCuotaPactada(this.form.frecuenciaPago);
  }

  nombreDe(u: Usuario): string {
    return nombreConductor(u);
  }

  motoDe(m: Moto): string {
    return etiquetaMoto(m);
  }

  fechaCorta(value?: string | null): string {
    return fechaCortaWizard(value);
  }

  pasoVisitado(paso: ContratoWizardPasoId): boolean {
    return this.visitados.includes(paso);
  }

  puedeClickPaso(index: number): boolean {
    return puedeIrAPaso(
      this.pasos,
      this.visitados,
      this.form,
      this.planSeleccionado,
      this.pasoIndex,
      index,
    ).ok;
  }

  irA(index: number): void {
    const check = puedeIrAPaso(
      this.pasos,
      this.visitados,
      this.form,
      this.planSeleccionado,
      this.pasoIndex,
      index,
    );
    if (!check.ok) {
      Swal.fire({ icon: 'warning', title: 'Sigue el orden del wizard', text: check.mensaje });
      return;
    }
    this.pasoIndex = index;
  }

  atras(): void {
    if (this.pasoIndex > 0) this.pasoIndex -= 1;
  }

  siguiente(): void {
    const check = puedeAvanzar(this.pasoActual, this.form, this.planSeleccionado);
    if (!check.ok) {
      Swal.fire({ icon: 'warning', title: check.mensaje || 'Completa este paso' });
      return;
    }
    this.visitados = visitar(this.visitados, this.pasoActual);
    if (this.pasoIndex < this.pasos.length - 1) {
      this.pasoIndex += 1;
    }
  }

  confirmar(): void {
    const orden = puedeCrearBorrador(
      this.form,
      this.planSeleccionado,
      this.visitados,
      this.pasoActual,
      { omitirMoto: this.omitirMoto },
    );
    if (!orden.ok) {
      Swal.fire({ icon: 'warning', title: 'Sigue el orden del wizard', text: orden.mensaje });
      return;
    }
    const datos = formularioListoParaCrear(this.form, this.planSeleccionado, {
      omitirMoto: this.omitirMoto,
    });
    if (!datos.ok) {
      Swal.fire({ icon: 'warning', title: datos.mensaje || 'Faltan datos del contrato' });
      return;
    }
    this.crear.emit(payloadDesdeForm(this.form));
  }

  seleccionarConductor(u: Usuario): void {
    if (!u._id) return;
    this.form.conductorId = u._id;
  }

  seleccionarMoto(m: Moto): void {
    if (!m._id) return;
    this.form.motoId = m._id;
  }

  seleccionarPlan(p: Plan): void {
    if (!p._id || p._id === this.form.planId) return;
    this.form.planId = p._id;
    this.onCambioPlan();
  }

  onCambioPlan(): void {
    const plan = this.planSeleccionado;
    this.form = aplicarCambioPlan(this.form, plan);
    this.visitados = invalidarPosteriores(this.visitados, this.pasos, 'plan');
    this.alinearPaso();
  }

  onCambioFrecuencia(): void {
    this.form = aplicarCambioFrecuencia(this.form, this.planSeleccionado, this.form.frecuenciaPago);
    this.visitados = invalidarPosteriores(this.visitados, this.pasos, 'frecuencia');
  }

  elegirFrecuencia(f: FrecuenciaPago): void {
    this.form.frecuenciaPago = f;
    this.onCambioFrecuencia();
  }

  onCambioInicio(): void {
    this.form = aplicarCambioInicio(this.form);
  }

  onCambioDuracion(): void {
    this.form = aplicarCambioDuracion(this.form, this.planSeleccionado);
  }

  private alinearPaso(): void {
    const pasos = this.pasos;
    if (this.pasoIndex >= pasos.length) this.pasoIndex = pasos.length - 1;
    if (this.pasoIndex < 0) this.pasoIndex = 0;
  }
}
