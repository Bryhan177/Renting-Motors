import { ContratoWizardComponent } from './contrato-wizard.component';
import { Plan } from '../../interfaces/plan';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

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

describe('ContratoWizardComponent', () => {
  let wizard: ContratoWizardComponent;
  let crear: jest.Mock;

  beforeEach(() => {
    wizard = new ContratoWizardComponent();
    wizard.planes = [personal];
    wizard.conductores = [
      { _id: 'c1', nombre: 'Ana', apellido: 'L', email: '', cedula: 1, telefono: '', rol: 'empleado', activo: true },
    ];
    wizard.motos = [
      { _id: 'm1', placa: 'ABC12', marca: 'AKT', modelo: 'NKD', precio: 0, estado: 'disponible' },
    ];
    wizard.reset();
    crear = jest.fn();
    wizard.crear.subscribe(crear);
  });

  it('no emite crear desde el primer paso (no se puede saltar al guardado)', () => {
    wizard.confirmar();
    expect(crear).not.toHaveBeenCalled();
    expect(wizard.pasoActual).toBe('conductor');
  });

  it('Siguiente no avanza sin selección', () => {
    wizard.siguiente();
    expect(wizard.pasoActual).toBe('conductor');
  });

  it('recorre los pasos y solo entonces emite crear', () => {
    wizard.seleccionarConductor(wizard.conductores[0]);
    wizard.siguiente();
    wizard.seleccionarMoto(wizard.motos[0]);
    wizard.siguiente();
    wizard.seleccionarPlan(personal);
    wizard.siguiente();
    wizard.siguiente(); // frecuencia (ya prellenada)
    wizard.siguiente(); // valor (sugerido 115000)
    wizard.siguiente(); // fecha
    wizard.siguiente(); // duración
    expect(wizard.pasoActual).toBe('resumen');
    expect(wizard.esResumen).toBe(true);
    wizard.confirmar();
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({
        conductorId: 'c1',
        motoId: 'm1',
        planId: 'plan-personal',
        planNombre: 'Personal',
        cuotaSemanal: 115000,
      }),
    );
  });

  it('con moto fija omite el paso moto', () => {
    wizard.motoFija = wizard.motos[0];
    wizard.reset();
    expect(wizard.pasos).not.toContain('moto');
    expect(wizard.form.motoId).toBe('m1');
  });

  it('Propietario inserta el paso de cuota inicial antes del resumen', () => {
    const propietario: Plan = {
      ...personal,
      _id: 'plan-propietario',
      nombre: 'Propietario',
      valorSugerido: 0,
      requiereCuotaInicial: true,
      duracionMinimaMeses: 3,
      periodicidadesPermitidas: ['semanal', 'quincenal', 'mensual'],
    };
    wizard.planes = [propietario];
    wizard.form.planId = propietario._id!;
    wizard.onCambioPlan();
    expect(wizard.pasos).toContain('cuotaInicial');
    expect(wizard.pasos[wizard.pasos.length - 2]).toBe('cuotaInicial');
    expect(wizard.pasos[wizard.pasos.length - 1]).toBe('resumen');
  });
});
