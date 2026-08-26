import { routes } from './app.routes';

describe('app.routes contratos', () => {
  const staffChildren = routes.find((r) => r.path === '')?.children || [];

  it('expone /contratos y /planes para administrador y asesor, igual que motos y pagos', () => {
    const contratos = staffChildren.find((c) => c.path === 'contratos');
    const planes = staffChildren.find((c) => c.path === 'planes');
    const motos = staffChildren.find((c) => c.path === 'motos');
    expect(contratos).toBeTruthy();
    expect(planes).toBeTruthy();
    expect(contratos?.data).toEqual({ roles: ['administrador', 'asesor'] });
    expect(planes?.data).toEqual({ roles: ['administrador', 'asesor'] });
    expect(contratos?.canActivate).toEqual(motos?.canActivate);
    expect(planes?.canActivate).toEqual(motos?.canActivate);
  });
});
