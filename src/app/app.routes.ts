import { Routes } from '@angular/router';
import { DashboardComponent } from './Components/pages/dashboard/dashboard.component';
import { EmpleadosComponent } from './Components/pages/empleados/empleados.component';
import { MotosComponent } from './Components/pages/motos/motos.component';
import { PagosComponent } from './Components/pages/pagos/pagos.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'empleados', component: EmpleadosComponent },
  { path: 'motos', component: MotosComponent },
  { path: 'pagos', component: PagosComponent },
];

