import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { parseRpcJson } from '../shared/cobro-finanzas.mapper';
import {
  PeriodoDashboard,
  ResumenDashboard,
  mapResumenDashboardFromRow,
} from '../shared/dashboard-kpis';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  /**
   * KPIs agregados en Postgres (RPC staff-only).
   * No trae filas de cobros/abonos para sumar en el browser.
   */
  getResumen(periodo: PeriodoDashboard = 'mes'): Observable<ResumenDashboard> {
    return from(getSupabase().rpc('resumen_dashboard', { p_periodo: periodo })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return mapResumenDashboardFromRow(parseRpcJson(data), periodo);
      }),
    );
  }
}
