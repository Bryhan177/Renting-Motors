import { of } from 'rxjs';
import { FlujoCajaComponent } from './flujo-caja.component';
import { CajaService } from '../../../service/caja.service';
import { MotosService } from '../../../service/motos.service';
import { BANCOS_CAJA_FALLBACK } from '../../../shared/caja-resumen';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: false }) },
}));

describe('FlujoCajaComponent', () => {
  const caja = {
    listBancos: jest.fn().mockReturnValue(of(BANCOS_CAJA_FALLBACK)),
    resumen: jest.fn().mockReturnValue(of([])),
    list: jest.fn().mockReturnValue(of([])),
    registrar: jest.fn(),
    crearBanco: jest.fn(),
    actualizarBanco: jest.fn(),
  };
  const motos = {
    getMotosLista: jest.fn().mockReturnValue(of([])),
  };

  let component: FlujoCajaComponent;

  beforeEach(() => {
    caja.listBancos.mockReturnValue(of(BANCOS_CAJA_FALLBACK));
    caja.resumen.mockReturnValue(of([]));
    caja.list.mockReturnValue(of([]));
    caja.crearBanco.mockReset();
    caja.actualizarBanco.mockReset();
    component = new FlujoCajaComponent(
      caja as unknown as CajaService,
      motos as unknown as MotosService,
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('al cargar pide bancos, resumen y movimientos', () => {
    component.ngOnInit();
    expect(caja.listBancos).toHaveBeenCalled();
    expect(caja.resumen).toHaveBeenCalledWith(['mdd', 'ahorro_mdd']);
    expect(caja.list).toHaveBeenCalled();
    expect(component.bancos.map((b) => b.codigo)).toEqual(['mdd', 'ahorro_mdd']);
  });

  it('labelBanco usa el nombre del catálogo', () => {
    component.bancos = [
      { id: '1', codigo: 'deposito_dan78d', nombre: 'Deposito DAN78D' },
    ];
    expect(component.labelBanco('deposito_dan78d')).toBe('Deposito DAN78D');
  });

  it('el formulario de banco solo pide nombre', () => {
    component.abrirCrearBanco();
    expect(component.mostrarModalBanco).toBe(true);
    expect(component.formBanco).toEqual({ nombre: '' });
    expect(Object.keys(component.formBanco)).toEqual(['nombre']);
  });

  it('no crea banco sin nombre', () => {
    component.abrirCrearBanco();
    component.guardarBanco();
    expect(caja.crearBanco).not.toHaveBeenCalled();
  });

  it('renombrar rellena el nombre actual y llama update', () => {
    caja.actualizarBanco.mockReturnValue(of({ id: '1', codigo: 'mdd', nombre: 'Banco Principal' }));
    component.abrirEditarBanco({ id: '1', codigo: 'mdd', nombre: 'Banco MDD' });
    expect(component.modoEdicionBanco).toBe(true);
    component.formBanco.nombre = 'Banco Principal';
    component.guardarBanco();
    expect(caja.actualizarBanco).toHaveBeenCalledWith('1', { nombre: 'Banco Principal' });
  });

  it('nuevo movimiento usa el primer banco del catálogo (incluido uno creado)', () => {
    component.bancos = [
      { id: 'x', codigo: 'deposito_dan78d', nombre: 'Deposito DAN78D' },
      ...BANCOS_CAJA_FALLBACK,
    ];
    component.abrir();
    expect(component.form.banco).toBe('deposito_dan78d');
    expect(component.mostrarModal).toBe(true);
  });
});
