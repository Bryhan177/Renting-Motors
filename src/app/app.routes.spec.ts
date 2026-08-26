import { routes } from './app.routes';

describe('app.routes contratos', () => {
  const staffChildren = routes.find((r) => r.path === '')?.children || [];

  it('expone /contratos, /planes y /talleres para administrador y asesor, igual que motos y pagos', () => {
    const contratos = staffChildren.find((c) => c.path === 'contratos');
    const planes = staffChildren.find((c) => c.path === 'planes');
    const talleres = staffChildren.find((c) => c.path === 'talleres');
    const motos = staffChildren.find((c) => c.path === 'motos');
    expect(contratos).toBeTruthy();
    expect(planes).toBeTruthy();
    expect(talleres).toBeTruthy();
    expect(contratos?.data).toEqual({ roles: ['administrador', 'asesor'] });
    expect(planes?.data).toEqual({ roles: ['administrador', 'asesor'] });
    expect(talleres?.data).toEqual({ roles: ['administrador', 'asesor'] });
    expect(contratos?.canActivate).toEqual(motos?.canActivate);
    expect(planes?.canActivate).toEqual(motos?.canActivate);
    expect(talleres?.canActivate).toEqual(motos?.canActivate);
  });

  it('deja /dashboard solo para administrador y asesor (no empleado)', () => {
    const dashboard = staffChildren.find((c) => c.path === 'dashboard');
    const motos = staffChildren.find((c) => c.path === 'motos');
    expect(dashboard).toBeTruthy();
    expect(dashboard?.data).toEqual({ roles: ['administrador', 'asesor'] });
    expect(dashboard?.canActivate).toEqual(motos?.canActivate);
  });

  it('deja /empleados solo para rol empleado', () => {
    const empleados = routes.find((r) => r.path === 'empleados');
    expect(empleados).toBeTruthy();
    expect(empleados?.data).toEqual({ roles: ['empleado'] });
  });
});
