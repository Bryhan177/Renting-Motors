import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { Pago, CreatePagoPayload } from '../shared/interfaces/pago';
import { supabase } from '../supabase/supabase.client';

@Injectable({
  providedIn: 'root'
})
export class PagosService {

  constructor() { }

  private mapPago(pago: any): Pago {
    return {
      ...pago,
      _id: pago.id,
      conductorId: pago.conductor_id,
      conductor: pago.conductor ? { ...pago.conductor, _id: pago.conductor.id } : undefined,
      fechaPago: pago.fecha_pago,
      gastos: pago.gastos,
      descripcionGasto: pago.descripcion_gasto,
      metodoPago: pago.metodo_pago,
      observaciones: pago.observaciones
    };
  }

  getPagos(): Observable<Pago[]> {
    return from(supabase.from('pagos').select('*, conductor:usuarios(*)')).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map(p => this.mapPago(p));
      })
    );
  }

  getPago(id: string): Observable<Pago> {
    return from(supabase.from('pagos').select('*, conductor:usuarios(*)').eq('id', id).single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return this.mapPago(data);
      })
    );
  }

  createPago(pago: CreatePagoPayload): Observable<Pago> {
    const payload = {
      conductor_id: pago.conductorId,
      semana: pago.semana,
      monto: pago.monto,
      pagado: pago.pagado || false,
      fecha_pago: pago.fechaPago || null,
      gastos: pago.gastos || 0,
      descripcion_gasto: pago.descripcionGasto || null,
      metodo_pago: pago.metodoPago || null,
      observaciones: pago.observaciones || null
    };
    return from(supabase.from('pagos').insert(payload).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return this.mapPago(data);
      })
    );
  }

  updatePago(id: string, pago: Partial<Pago>): Observable<Pago> {
    const payload: any = { ...pago };
    if (pago.conductorId !== undefined) payload.conductor_id = pago.conductorId;
    if (pago.fechaPago !== undefined) payload.fecha_pago = pago.fechaPago;
    if (pago.descripcionGasto !== undefined) payload.descripcion_gasto = pago.descripcionGasto;
    if (pago.metodoPago !== undefined) payload.metodo_pago = pago.metodoPago;
    
    // Eliminar las keys camelCase para que no se envíen a la base de datos
    delete payload._id;
    delete payload.conductorId;
    delete payload.fechaPago;
    delete payload.descripcionGasto;
    delete payload.metodoPago;
    delete payload.conductor;

    return from(supabase.from('pagos').update(payload).eq('id', id).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return this.mapPago(data);
      })
    );
  }

  deletePago(id: string): Observable<Pago> {
    return from(supabase.from('pagos').delete().eq('id', id).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return this.mapPago(data);
      })
    );
  }

  // Métodos específicos para el negocio
  getPagosByConductor(conductorId: string): Observable<Pago[]> {
    return from(supabase.from('pagos').select('*, conductor:usuarios(*)').eq('conductor_id', conductorId)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map(p => this.mapPago(p));
      })
    );
  }

  getPagosBySemana(semana: string): Observable<Pago[]> {
    return from(supabase.from('pagos').select('*, conductor:usuarios(*)').eq('semana', semana)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map(p => this.mapPago(p));
      })
    );
  }

  getTotalSemanal(semana: string): Observable<number> {
    return from(supabase.from('pagos').select('monto').eq('semana', semana).eq('pagado', true)).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).reduce((sum, p) => sum + p.monto, 0);
      })
    );
  }

  marcarComoPagado(id: string): Observable<Pago> {
    return from(supabase.from('pagos').update({ pagado: true, fecha_pago: new Date() }).eq('id', id).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return this.mapPago(data);
      })
    );
  }
}
