import { Routes } from '@angular/router';

import { DashboardComponent } from './Components/pages/dashboard/dashboard.component';
import { UsuariosComponent } from './Components/pages/usuarios/usuarios.component';
import { MotosComponent } from './Components/pages/motos/motos.component';
import { PagosComponent } from './Components/pages/pagos/pagos.component';
import { ContratosComponent } from './Components/pages/contratos/contratos.component';
import { PlanesComponent } from './Components/pages/planes/planes.component';
import { MantenimientosComponent } from './Components/pages/mantenimientos/mantenimientos.component';
import { FlujoCajaComponent } from './Components/pages/flujo-caja/flujo-caja.component';
import { HomeComponent } from './Components/home/home.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { LayoutComponent } from './shared/layouts/layout/layout.component';
import { HomeEmpleadosComponent } from './empleados/home-empleados/home-empleados.component';
import { HistoryVehicleComponent } from './shared/components/history-vehicle/history-vehicle.component';
import { DocumentationComponent } from './shared/components/documentation/documentation.component';
import { authGuard, roleGuard } from './auth/auth.guard';

const staff = { roles: ['administrador', 'asesor'] };
const empleado = { roles: ['empleado'] };

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  {
    path: '',
    component: LayoutComponent,
    children: [
      { path: '', component: HomeComponent },
      {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'usuarios',
        component: UsuariosComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'motos',
        component: MotosComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'contratos',
        component: ContratosComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'planes',
        component: PlanesComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'pagos',
        component: PagosComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'mantenimientos',
        component: MantenimientosComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'flujo-caja',
        component: FlujoCajaComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'history-vehicle',
        component: HistoryVehicleComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
      {
        path: 'documentation',
        component: DocumentationComponent,
        canActivate: [authGuard, roleGuard],
        data: staff,
      },
    ],
  },
  {
    path: 'empleados',
    component: HomeEmpleadosComponent,
    canActivate: [authGuard, roleGuard],
    data: empleado,
  },
  { path: '**', redirectTo: '' },
];
