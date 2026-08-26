import { parseDateOnly } from './periodo.util';
import type { Cobro, EstadoCuenta, ResumenCobros } from '../service/cobros.service';

/** Lee finanzas del backend; no recalcula mora ni saldo. */
export function mapCobroFromRow(row: any): Cobro {
  const conductor = row.usuarios
    ? {
        _id: row.usuarios.id,
        nombre: row.usuarios.nombre,
        apellido: row.usuarios.apellido,
        email: row.usuarios.email,
        cedula: row.usuarios.cedula,
        telefono: row.usuarios.telefono,
        rol: row.usuarios.rol,
        activo: row.usuarios.activo,
      }
    : undefined;
  return {
    _id: row.id,
    contratoId: row.contrato_id,
    conductorId: conductor || row.conductor_id,
    motoId: row.moto_id,
    numeroPeriodo: row.numero_periodo,
    periodoInicio: row.periodo_inicio,
    periodoFin: row.periodo_fin,
    fechaVencimiento: row.fecha_vencimiento,
    montoEsperado: Number(row.monto_esperado),
    montoPagado: Number(row.monto_pagado),
    saldo: Number(row.saldo),
    estado: row.estado,
    enMora: !!row.en_mora,
    conductor,
  };
}

export function mapEstadoCuentaFromRow(row: any, cobros?: Cobro[]): EstadoCuenta {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    const fecha = row.fecha_mora_mas_antigua ?? row.fechaMoraMasAntigua;
    return {
      deudaTotal: Number(row.deuda_total ?? row.deudaTotal ?? 0),
      deudaEnMora: Number(row.deuda_en_mora ?? row.deudaEnMora ?? 0),
      periodosVencidos: Number(row.periodos_vencidos ?? row.periodosVencidos ?? 0),
      enMora: !!(row.en_mora ?? row.enMora),
      fechaMoraMasAntigua: fecha ? parseDateOnly(fecha) : null,
    };
  }
  return estadoCuentaDesdeCobros(cobros || []);
}

export function mapResumenFromRow(row: any, cobros?: Cobro[]): ResumenCobros {
  if (row && typeof row === 'object' && !Array.isArray(row)) {
    return {
      pagadoTotal: Number(row.pagado_total ?? row.pagadoTotal ?? 0),
      pendienteTotal: Number(row.pendiente_total ?? row.pendienteTotal ?? 0),
      enMoraTotal: Number(row.en_mora_total ?? row.enMoraTotal ?? 0),
    };
  }
  return resumenDesdeCobros(cobros || []);
}

export function estadoCuentaDesdeCobros(cobros: Cobro[]): EstadoCuenta {
  const enMora = cobros.filter((c) => c.enMora);
  const fechas = enMora.map((c) => parseDateOnly(c.fechaVencimiento).getTime());
  return {
    deudaTotal: cobros.reduce((s, c) => s + c.saldo, 0),
    deudaEnMora: enMora.reduce((s, c) => s + c.saldo, 0),
    periodosVencidos: enMora.length,
    enMora: enMora.length > 0,
    fechaMoraMasAntigua: fechas.length ? new Date(Math.min(...fechas)) : null,
  };
}

export function resumenDesdeCobros(cobros: Cobro[]): ResumenCobros {
  return {
    pagadoTotal: cobros.reduce((s, c) => s + c.montoPagado, 0),
    pendienteTotal: cobros.reduce((s, c) => s + c.saldo, 0),
    enMoraTotal: cobros.filter((c) => c.enMora).reduce((s, c) => s + c.saldo, 0),
  };
}

export function parseRpcJson(data: any): any {
  if (data == null) return null;
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}
