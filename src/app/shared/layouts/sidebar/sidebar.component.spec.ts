import { SidebarComponent } from './sidebar.component';

describe('SidebarComponent', () => {
  const router = { navigate: jest.fn() };
  const authService = { logout: jest.fn() };
  let component: SidebarComponent;

  beforeEach(() => {
    router.navigate.mockReset();
    component = new SidebarComponent(router as any, authService as any);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('navega a /contratos y /planes junto al resto del menú staff', () => {
    component.goContratos();
    expect(router.navigate).toHaveBeenCalledWith(['/contratos']);
    component.goPlanes();
    expect(router.navigate).toHaveBeenCalledWith(['/planes']);
    component.goMotos();
    expect(router.navigate).toHaveBeenCalledWith(['/motos']);
    component.goPagos();
    expect(router.navigate).toHaveBeenCalledWith(['/pagos']);
  });
});
