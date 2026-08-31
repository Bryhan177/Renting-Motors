import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, catchError, of } from 'rxjs';
import { getSupabase } from '../supabase/supabase.client';
import { Moto } from '../shared/interfaces/moto';
import { Usuario } from '../shared/interfaces/usuario';
import { Estadisticas } from '../shared/interfaces/pago';
import { stripClienteEmpresaId } from '../shared/empresa-scope';

/**
 * Listas (landing, inventario, contratos): NUNCA la columna `imagen` (blob).
 * La foto de grilla sale de `imagen_url` (URL corta). Un LIKE/SELECT sobre
 * `imagen` hace que Postgres lea cada data: de varios MB.
 */
export const MOTOS_LISTA_SELECT =
  'id, marca, modelo, placa, estado, modalidad, precio_cobro, precio, precio_compra, conductor_id, pico_y_placa, soat, tecnomecanica, aceite, transito_matricula, fecha_ingreso, imagen_url, created_at, updated_at';

/** Landing anónima: sin conductor. Foto = imagen_url, no imagen. */
export const MOTOS_CATALOGO_SELECT =
  'id, marca, modelo, placa, estado, modalidad, precio_cobro, imagen_url';

/** Staff: nombres del conductor, no `usuarios(*)`. */
export const MOTOS_LISTA_CONDUCTOR_SELECT = `${MOTOS_LISTA_SELECT}, usuarios:conductor_id(id,nombre,apellido)`;

export function columnasDelSelect(select: string): string[] {
  return select
    .split(',')
    .map((part) => part.trim().split(':')[0].trim())
    .filter(Boolean);
}

/** Solo URL http(s). `data:` y paths relativos no se usan como src. */
export function imagenCatalogoPublico(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s || /^data:/i.test(s)) return undefined;
  if (!/^https?:\/\//i.test(s)) return undefined;
  return s;
}

/** Foto de lista: SOLO `imagen_url`. Ignora el blob `imagen`. */
export function fotoDesdeImagenUrl(row: any): string | undefined {
  return imagenCatalogoPublico(row?.imagen_url);
}

/** Landing: nunca conductor / PII aunque el row traiga usuarios. */
export function mapMotoCatalogo(row: any): Moto {
  const foto = fotoDesdeImagenUrl(row);
  return {
    _id: row?.id,
    marca: row?.marca || '',
    modelo: row?.modelo || '',
    placa: row?.placa || '',
    precio: 0,
    precioCompra: 0,
    precioCobro: Number(row?.precio_cobro) || 180000,
    modalidad: row?.modalidad === 'liquidacion' ? 'liquidacion' : 'arriendo',
    estado: row?.estado || 'disponible',
    conductorId: null,
    conductor: undefined,
    imagen: foto,
    imagenUrl: foto,
  };
}

/** Lista staff: conductor_id + nombre, foto desde imagen_url. */
export function mapMotoLista(row: any): Moto {
  const conductorRow = row?.usuarios;
  const conductor =
    conductorRow && conductorRow.id
      ? ({
          _id: conductorRow.id,
          nombre: conductorRow.nombre,
          apellido: conductorRow.apellido,
          email: '',
          cedula: 0,
          telefono: '',
          rol: 'empleado',
          activo: conductorRow.activo !== false,
        } as Usuario)
      : undefined;
  const foto = fotoDesdeImagenUrl(row);
  return {
    _id: row?.id,
    marca: row?.marca || '',
    modelo: row?.modelo || '',
    placa: row?.placa || '',
    precio: Number(row?.precio_compra ?? row?.precio) || 0,
    precioCompra: Number(row?.precio_compra ?? row?.precio) || 0,
    precioCobro: Number(row?.precio_cobro) || 180000,
    soat: row?.soat || null,
    tecnomecanica: row?.tecnomecanica || null,
    aceite: row?.aceite || null,
    transitoMatricula: row?.transito_matricula || null,
    fechaIngreso: row?.fecha_ingreso || null,
    picoYPlaca: row?.pico_y_placa || null,
    modalidad: row?.modalidad === 'liquidacion' ? 'liquidacion' : 'arriendo',
    estado: row?.estado || 'disponible',
    conductorId: row?.conductor_id || conductor?._id || null,
    conductor,
    imagen: foto,
    imagenUrl: foto,
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
  };
}

@Injectable({ providedIn: 'root' })
export class MotosService {
  private mapUsuario(row: any): Usuario | undefined {
    if (!row) return undefined;
    return {
      _id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      email: row.email,
      cedula: row.cedula,
      telefono: row.telefono,
      rol: row.rol,
      activo: row.activo !== false,
    };
  }

  private mapMoto(row: any): Moto {
    const conductor = this.mapUsuario(row.usuarios || row.conductor);
    const precioCompra = Number(row.precio_compra ?? row.precio) || 0;
    const foto = fotoDesdeImagenUrl(row) || imagenCatalogoPublico(row.imagen);
    return {
      _id: row.id,
      marca: row.marca,
      modelo: row.modelo,
      placa: row.placa,
      precio: precioCompra,
      precioCompra,
      precioCobro: Number(row.precio_cobro) || 180000,
      soat: row.soat || null,
      tecnomecanica: row.tecnomecanica || null,
      aceite: row.aceite || null,
      transitoMatricula: row.transito_matricula || null,
      fechaIngreso: row.fecha_ingreso || null,
      picoYPlaca: row.pico_y_placa || null,
      modalidad: row.modalidad === 'liquidacion' ? 'liquidacion' : 'arriendo',
      estado: row.estado,
      conductorId: row.conductor_id || conductor?._id || null,
      conductor,
      imagen: foto,
      imagenUrl: foto,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toPayload(moto: Partial<Moto>, imagenUrl?: string | null): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    if (moto.marca !== undefined) payload['marca'] = moto.marca;
    if (moto.modelo !== undefined) payload['modelo'] = moto.modelo;
    if (moto.placa !== undefined) payload['placa'] = moto.placa;
    const compra = moto.precioCompra ?? moto.precio;
    if (compra !== undefined) {
      payload['precio'] = compra;
      payload['precio_compra'] = compra;
    }
    if (moto.precioCobro !== undefined) payload['precio_cobro'] = moto.precioCobro;
    if (moto.soat !== undefined) payload['soat'] = moto.soat || null;
    if (moto.tecnomecanica !== undefined) payload['tecnomecanica'] = moto.tecnomecanica || null;
    if (moto.aceite !== undefined) payload['aceite'] = moto.aceite || null;
    if (moto.transitoMatricula !== undefined) payload['transito_matricula'] = moto.transitoMatricula || null;
    if (moto.fechaIngreso !== undefined) payload['fecha_ingreso'] = moto.fechaIngreso || null;
    if (moto.picoYPlaca !== undefined) payload['pico_y_placa'] = moto.picoYPlaca || null;
    if (moto.modalidad !== undefined) payload['modalidad'] = moto.modalidad || 'arriendo';
    if (moto.estado !== undefined) payload['estado'] = moto.estado;
    if (moto.conductorId !== undefined) payload['conductor_id'] = moto.conductorId || null;
    if (imagenUrl !== undefined) {
      const url = imagenCatalogoPublico(imagenUrl) || null;
      payload['imagen_url'] = url;
      payload['imagen'] = url;
    } else if (moto.imagen !== undefined) {
      const url = imagenCatalogoPublico(moto.imagen) || null;
      payload['imagen_url'] = url;
      if (url) payload['imagen'] = url;
    }
    return stripClienteEmpresaId(payload);
  }

  getMotos(): Observable<Moto[]> {
    return this.queryLista(MOTOS_LISTA_CONDUCTOR_SELECT);
  }

  /** Lista sin embed de usuarios. Contratos / wizard / filtros. */
  getMotosLista(): Observable<Moto[]> {
    return this.queryLista(MOTOS_LISTA_SELECT);
  }

  /**
   * Catálogo de la landing (`/`). Columnas livianas, sin join a `usuarios`
   * y sin columna `imagen`. La foto sale de `imagen_url` en el mismo SELECT.
   */
  getMotosPublicas(): Observable<Moto[]> {
    return this.queryLista(MOTOS_CATALOGO_SELECT, mapMotoCatalogo);
  }

  private queryLista(
    columns: string,
    mapper: (row: any) => Moto = mapMotoLista,
  ): Observable<Moto[]> {
    return from(
      getSupabase().from('motos').select(columns).order('created_at', { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => mapper(r));
      }),
    );
  }

  getMoto(id: string): Observable<Moto> {
    return from(
      getSupabase()
        .from('motos')
        .select(MOTOS_LISTA_CONDUCTOR_SELECT)
        .eq('id', id)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error || !data) throw error || new Error('MDD no encontrada');
        return this.mapMoto(data);
      }),
    );
  }

  uploadImagen(fileOrDataUrl: File | string, placa: string): Observable<string> {
    const sb = getSupabase();
    const path = `${placa.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.jpg`;
    const uploadBlob = (blob: Blob) =>
      from(
        sb.storage.from('motos').upload(path, blob, { upsert: true, contentType: blob.type || 'image/jpeg' }),
      ).pipe(
        map(({ error }) => {
          if (error) throw error;
          return sb.storage.from('motos').getPublicUrl(path).data.publicUrl;
        }),
      );
    if (typeof fileOrDataUrl === 'string') {
      if (fileOrDataUrl.startsWith('http')) return of(fileOrDataUrl);
      return from(fetch(fileOrDataUrl).then((r) => r.blob())).pipe(switchMap((blob) => uploadBlob(blob)));
    }
    return uploadBlob(fileOrDataUrl);
  }

  createMoto(moto: Omit<Moto, '_id'>): Observable<Moto> {
    const sb = getSupabase();
    const insert = (imagenUrl: string | null) => {
      const payload = {
        ...this.toPayload(moto, imagenUrl),
        estado: moto.estado || 'disponible',
        conductor_id: moto.conductorId || null,
        modalidad: moto.modalidad || 'arriendo',
        fecha_ingreso: moto.fechaIngreso || new Date().toISOString().slice(0, 10),
      };
      return from(sb.from('motos').insert(payload).select(MOTOS_LISTA_CONDUCTOR_SELECT).single()).pipe(
        map(({ data, error }) => {
          if (error || !data) {
            const msg = error?.message || 'No se pudo crear la MDD';
            if (String(msg).includes('row-level security')) {
              throw new Error('RLS bloqueó la MDD. Ejecuta el SQL de emergencia y vuelve a entrar.');
            }
            throw error || new Error(msg);
          }
          return this.mapMoto(data);
        }),
      );
    };

    return from(sb.auth.getSession()).pipe(
      switchMap(({ data }) => {
        if (!data.session) throw new Error('No hay sesión. Vuelve a iniciar sesión.');
        if (moto.imagen && String(moto.imagen).startsWith('data:')) {
          return this.uploadImagen(moto.imagen, moto.placa).pipe(
            switchMap((url) => insert(url)),
            catchError(() => insert(null)),
          );
        }
        return insert(moto.imagen || null);
      }),
    );
  }

  updateMoto(id: string, moto: Partial<Moto>): Observable<Moto> {
    const apply = (imagenUrl?: string) => {
      const payload = this.toPayload(moto, imagenUrl);
      payload['updated_at'] = new Date().toISOString();
      return from(
        getSupabase().from('motos').update(payload).eq('id', id).select(MOTOS_LISTA_CONDUCTOR_SELECT).single(),
      ).pipe(
        map(({ data, error }) => {
          if (error || !data) throw error || new Error('No se pudo actualizar');
          return this.mapMoto(data);
        }),
      );
    };
    if (moto.imagen && String(moto.imagen).startsWith('data:')) {
      return this.uploadImagen(moto.imagen, moto.placa || id).pipe(
        switchMap((url) => apply(url)),
        catchError(() => apply()),
      );
    }
    return apply();
  }

  deleteMoto(id: string): Observable<Moto> {
    return from(this.deleteMotoAsync(id));
  }

  private async deleteMotoAsync(id: string): Promise<Moto> {
    const sb = getSupabase();

    const { data: contratos, error: cErr } = await sb
      .from('contratos')
      .select('id,estado')
      .eq('moto_id', id);
    if (cErr) throw cErr;

    const activos = (contratos || []).filter((c: { estado: string }) => c.estado === 'activo');
    if (activos.length) {
      throw new Error(
        'Esta MDD tiene un contrato activo. Primero haz la devolución o finaliza el contrato.',
      );
    }

    const contratoIds = (contratos || []).map((c: { id: string }) => c.id);
    if (contratoIds.length) {
      const { error: delContratosErr } = await sb.from('contratos').delete().in('id', contratoIds);
      if (delContratosErr) throw delContratosErr;
    }

    await Promise.all([
      sb.from('pagos').delete().eq('moto_id', id),
      sb.from('mantenimientos').delete().eq('moto_id', id),
      sb.from('movimientos_caja').update({ moto_id: null }).eq('moto_id', id),
      sb.from('documentos').update({ moto_id: null }).eq('moto_id', id),
      sb.from('novedades').update({ moto_id: null }).eq('moto_id', id),
    ]);

    const { data, error } = await sb.from('motos').delete().eq('id', id).select(MOTOS_LISTA_SELECT).single();
    if (error || !data) {
      const msg = error?.message || 'No se pudo eliminar';
      if (String(msg).includes('foreign key') || String(msg).includes('violates')) {
        throw new Error(
          'No se pudo eliminar: aún hay registros ligados. Ejecuta el SQL 20260822_motos_delete_cascade.sql en Supabase y reintenta.',
        );
      }
      throw error || new Error(msg);
    }
    return this.mapMoto(data);
  }

  getMotosByConductor(conductorId: string): Observable<Moto[]> {
    return from(
      getSupabase()
        .from('motos')
        .select(MOTOS_LISTA_SELECT)
        .eq('conductor_id', conductorId),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((r) => mapMotoLista(r));
      }),
    );
  }

  getConductoresDisponibles(): Observable<Usuario[]> {
    const sb = getSupabase();
    return from(sb.from('usuarios').select('*').eq('rol', 'empleado').eq('activo', true)).pipe(
      switchMap(({ data: usuarios, error }) => {
        if (error) throw error;
        return from(
          Promise.all([
            sb.from('motos').select('conductor_id').not('conductor_id', 'is', null),
            sb.from('contratos').select('conductor_id').eq('estado', 'activo'),
          ]),
        ).pipe(
          map(([motosRes, contratosRes]) => {
            const ocupados = new Set<string>();
            (motosRes.data || []).forEach((m: any) => ocupados.add(m.conductor_id));
            (contratosRes.data || []).forEach((c: any) => ocupados.add(c.conductor_id));
            return (usuarios || [])
              .filter((u: any) => !ocupados.has(u.id))
              .map((u: any) => this.mapUsuario(u)!);
          }),
        );
      }),
    );
  }

  getEstadisticas(): Observable<Estadisticas> {
    return from(getSupabase().from('motos').select('id,estado,conductor_id')).pipe(
      switchMap(({ data: motos, error }) => {
        if (error) throw error;
        const list = motos || [];
        return from(
          getSupabase().from('usuarios').select('id').eq('rol', 'empleado').eq('activo', true),
        ).pipe(
          map(({ data: empleados }) => {
            const ocupados = new Set(list.filter((m: any) => m.conductor_id).map((m: any) => m.conductor_id));
            const d = new Date();
            const oneJan = new Date(d.getFullYear(), 0, 1);
            const week = Math.ceil(((d.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
            return {
              totalMotos: list.length,
              motosAsignadas: list.filter((m: any) => m.estado === 'en_uso' || m.conductor_id).length,
              motosDisponibles: list.filter((m: any) => m.estado === 'disponible').length,
              conductoresDisponibles: (empleados || []).filter((e: any) => !ocupados.has(e.id)).length,
              totalRecaudadoSemana: 0,
              semanaActual: `${d.getFullYear()}-W${String(week).padStart(2, '0')}`,
            } as Estadisticas;
          }),
        );
      }),
    );
  }
}
