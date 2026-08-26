import {
  aplicarCambioDuracion,
  aplicarCambioFrecuencia,
  aplicarCambioPlan,
  duracionMinimaDelPlan,
  formularioListoParaCrear,
  formWizardVacio,
  invalidarPosteriores,
  puedeAvanzar,
  puedeCrearBorrador,
  puedeIrAPaso,
  pasosDelWizard,
  resumenContrato,
  visitar,
} from './contrato-wizard';
import { Plan } from './interfaces/plan';
import { fechaFinMinima } from './contrato.rules';

const personal: Plan = {
  _id: 'plan-personal',
  nombre: 'Personal',
  descripcion: 'Uso personal',
  condicionesUso: 'No delivery',
  periodicidadesPermitidas: ['semanal', 'quincenal'],
  valorSugerido: 115000,
  permiteNegociacion: true,
  duracionMinimaMeses: 3,
  requiereCuotaInicial: false,
  activo: true,
};

const fijo: Plan = {
  ...personal,
  _id: 'plan-fijo',
  nombre: 'Fijo',
  permiteNegociacion: false,
};

const propietario: Plan = {
  _id: 'plan-propietario',
  nombre: 'Propietario',
  descripcion: 'Ex Liquidación',
  condicionesUso: 'Cuota a convenir',
  periodicidadesPermitidas: ['semanal', 'quincenal', 'mensual'],
  valorSugerido: 0,
  permiteNegociacion: true,
  duracionMinimaMeses: 6,
  requiereCuotaInicial: true,
  activo: true,
};

function formCompleto(plan: Plan) {
  const inicio = '2026-03-01';
  const duracionMeses = duracionMinimaDelPlan(plan);
  return aplicarCambioPlan(
    {
      ...formWizardVacio(),
      conductorId: 'c1',
      motoId: 'm1',
      fechaInicio: inicio,
    },
    plan,
  );
}

describe('contrato-wizard', () => {
  it('el formulario vacío no pacta cuota ni plan (no usa 180000)', () => {
    const form = formWizardVacio();
    expect(form.cuotaSemanal).toBe(0);
    expect(form.planId).toBe('');
    expect(form.fechaFin).toBe(fechaFinMinima(form.fechaInicio));
  });

  it('Personal no incluye paso de cuota inicial; Propietario sí', () => {
    expect(pasosDelWizard(personal)).toEqual([
      'conductor',
      'moto',
      'plan',
      'frecuencia',
      'valor',
      'fechaInicio',
      'duracion',
      'resumen',
    ]);
    expect(pasosDelWizard(propietario)).toContain('cuotaInicial');
    expect(pasosDelWizard(personal, { omitirMoto: true })).not.toContain('moto');
    expect(pasosDelWizard(personal, { omitirMoto: true })[0]).toBe('conductor');
  });

  it('no se puede saltar a resumen ni crear sin recorrer los pasos', () => {
    const form = formCompleto(personal);
    const pasos = pasosDelWizard(personal);
    const visitados: typeof pasos = [];
    const salto = puedeIrAPaso(pasos, visitados, form, personal, 0, pasos.length - 1);
    expect(salto.ok).toBe(false);
    expect(salto.mensaje).toMatch(/Recorre el paso/);

    const crear = puedeCrearBorrador(form, personal, visitados, 'resumen');
    expect(crear.ok).toBe(false);

    const crearFueraDeResumen = puedeCrearBorrador(
      form,
      personal,
      pasos.filter((p) => p !== 'resumen'),
      'valor',
    );
    expect(crearFueraDeResumen.ok).toBe(false);
    expect(crearFueraDeResumen.mensaje).toMatch(/resumen/);
  });

  it('después de visitar cada paso (salvo resumen) sí se puede crear', () => {
    const form = formCompleto(personal);
    const pasos = pasosDelWizard(personal);
    const visitados = pasos.filter((p) => p !== 'resumen');
    expect(puedeCrearBorrador(form, personal, visitados, 'resumen').ok).toBe(true);
  });

  it('no avanza sin conductor / moto / plan / valor', () => {
    const vacio = formWizardVacio();
    expect(puedeAvanzar('conductor', vacio, null).ok).toBe(false);
    expect(puedeAvanzar('moto', vacio, null).ok).toBe(false);
    expect(puedeAvanzar('plan', vacio, null).ok).toBe(false);
    expect(puedeAvanzar('valor', { ...vacio, planId: personal._id! }, personal).ok).toBe(false);
  });

  it('frecuencia mensual no está permitida en Personal', () => {
    const form = { ...formCompleto(personal), frecuenciaPago: 'mensual' as const };
    expect(puedeAvanzar('frecuencia', form, personal).ok).toBe(false);
    const corregido = aplicarCambioFrecuencia(form, personal, 'mensual');
    expect(corregido.frecuenciaPago).toBe('semanal');
  });

  it('valor locked al sugerido si el plan no permite negociar', () => {
    const form = aplicarCambioPlan(formWizardVacio('m1'), fijo);
    expect(form.cuotaSemanal).toBe(115000);
    const negociado = { ...form, cuotaSemanal: 200000 };
    expect(puedeAvanzar('valor', negociado, fijo).ok).toBe(false);
    expect(puedeAvanzar('valor', form, fijo).ok).toBe(true);
  });

  it('Propietario exige valor a mano (sugerido 0) y duración ≥ 6', () => {
    const form = aplicarCambioPlan(
      { ...formWizardVacio(), conductorId: 'c1', motoId: 'm1' },
      propietario,
    );
    expect(form.cuotaSemanal).toBe(0);
    expect(form.duracionMeses).toBe(6);
    expect(puedeAvanzar('valor', form, propietario).ok).toBe(false);
    const conValor = { ...form, cuotaSemanal: 90000 };
    expect(puedeAvanzar('valor', conValor, propietario).ok).toBe(true);
    expect(puedeAvanzar('duracion', { ...conValor, duracionMeses: 3 }, propietario).ok).toBe(false);
    const conDuracion = aplicarCambioDuracion({ ...conValor, duracionMeses: 3 }, propietario);
    expect(conDuracion.duracionMeses).toBe(6);
    expect(puedeAvanzar('duracion', conDuracion, propietario).ok).toBe(true);
  });

  it('cambiar plan invalida pasos posteriores (hay que volver a recorrerlos)', () => {
    const pasos = pasosDelWizard(personal);
    const visitados = visitar(
      visitar(['conductor', 'moto', 'plan', 'frecuencia'], 'valor'),
      'fechaInicio',
    );
    const recortados = invalidarPosteriores(visitados, pasos, 'plan');
    expect(recortados).toEqual(['conductor', 'moto', 'plan']);
  });

  it('formularioListoParaCrear exige plan y valor aunque se omita el orden UI (Motos)', () => {
    const sinPlan = { ...formWizardVacio('m1'), conductorId: 'c1', cuotaSemanal: 115000 };
    expect(formularioListoParaCrear(sinPlan, null, { omitirMoto: true }).ok).toBe(false);
    const listo = formCompleto(personal);
    expect(formularioListoParaCrear(listo, personal, { omitirMoto: false }).ok).toBe(true);
  });

  it('el resumen incluye conductor, moto, plan, frecuencia, valor, fechas y cuota inicial', () => {
    const form = {
      ...formCompleto(propietario),
      cuotaSemanal: 80000,
      cuotaInicial: 500000,
    };
    const lineas = resumenContrato(
      form,
      propietario,
      { nombre: 'Ana', apellido: 'López' } as any,
      { placa: 'ABC12', marca: 'AKT', modelo: 'NKD' } as any,
    );
    const porLabel = Object.fromEntries(lineas.map((l) => [l.label, l.value]));
    expect(porLabel['Conductor']).toBe('Ana López');
    expect(porLabel['Moto']).toMatch(/ABC12/);
    expect(porLabel['Plan']).toBe('Propietario');
    expect(porLabel['Frecuencia']).toBe('Semanal');
    expect(porLabel['Valor pactado']).toBe(`$ ${Number(80000).toLocaleString('es-CO')}`);
    expect(porLabel['Cuota inicial']).toBe(`$ ${Number(500000).toLocaleString('es-CO')}`);
    expect(porLabel['Duración']).toMatch(/6 meses/);
  });

  it('Personal no muestra cuota inicial en el resumen', () => {
    const lineas = resumenContrato(formCompleto(personal), personal);
    expect(lineas.some((l) => l.label === 'Cuota inicial')).toBe(false);
  });
});
