import { HomeEmpleadosComponent } from './home-empleados.component';

describe('HomeEmpleadosComponent', () => {
  it('incluye Talleres en la navegación del conductor y no cambia el resto de secciones', () => {
    const ids = new HomeEmpleadosComponent(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ).navItems.map((i) => i.id);
    expect(ids).toContain('talleres');
    expect(ids).toEqual(['inicio', 'motos', 'cuenta', 'novedades', 'talleres', 'documentos', 'perfil']);
  });
});
