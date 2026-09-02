import { columnasDelSelect } from './motos.service';
import { MOTOS_EMBED_SELECT } from './motos.service';
import { NOVEDADES_LISTA_SELECT, NOVEDADES_DETALLE_SELECT } from './novedades.service';
import { PAGOS_LISTA_SELECT } from './pagos.service';
import { ABONOS_LISTA_SELECT } from './cobros.service';
import { MANTENIMIENTOS_LISTA_SELECT } from './mantenimientos.service';
import { USUARIOS_LISTA_SELECT } from './usuarios.service';
import { CAJA_LISTA_SELECT } from '../shared/caja-resumen';

/** El split por coma de columnasDelSelect no sirve para embeds; acá se busca la columna suelta. */
function pideColumnaImagen(select: string): boolean {
  return /(^|[,()])\s*imagen\s*([,)]|$)/.test(select);
}

describe('lecturas livianas (sin blob motos.imagen ni comprobante de lista)', () => {
  it('novedades de lista no pide foto ni motos.imagen', () => {
    expect(NOVEDADES_LISTA_SELECT).not.toMatch(/\bfoto\b/);
    expect(NOVEDADES_LISTA_SELECT).toContain(MOTOS_EMBED_SELECT);
    expect(pideColumnaImagen(NOVEDADES_LISTA_SELECT)).toBe(false);
    expect(NOVEDADES_DETALLE_SELECT).toMatch(/\bfoto\b/);
    expect(pideColumnaImagen(NOVEDADES_DETALLE_SELECT)).toBe(false);
  });

  it('pagos de lista no embebe motos.* ni comprobante_imagen', () => {
    expect(PAGOS_LISTA_SELECT).not.toMatch(/motos:moto_id\(\*\)/);
    expect(PAGOS_LISTA_SELECT).not.toMatch(/comprobante_imagen/);
    expect(PAGOS_LISTA_SELECT).toContain(MOTOS_EMBED_SELECT);
    expect(pideColumnaImagen(PAGOS_LISTA_SELECT)).toBe(false);
  });

  it('abonos de lista no pide comprobante', () => {
    expect(ABONOS_LISTA_SELECT).not.toMatch(/comprobante/);
    expect(ABONOS_LISTA_SELECT).not.toMatch(/\*/);
  });

  it('mantenimientos embebe imagen_url, no imagen', () => {
    expect(MANTENIMIENTOS_LISTA_SELECT).toContain(MOTOS_EMBED_SELECT);
    expect(pideColumnaImagen(MANTENIMIENTOS_LISTA_SELECT)).toBe(false);
  });

  it('caja lista embebe solo placa, no motos.* ni imagen', () => {
    expect(CAJA_LISTA_SELECT).toMatch(/motos:moto_id\(placa\)/);
    expect(CAJA_LISTA_SELECT).not.toMatch(/motos:moto_id\(\*\)/);
    expect(CAJA_LISTA_SELECT).not.toMatch(/\*/);
    expect(pideColumnaImagen(CAJA_LISTA_SELECT)).toBe(false);
  });

  it('usuarios de lista no usa select *', () => {
    expect(USUARIOS_LISTA_SELECT).not.toMatch(/\*/);
    expect(columnasDelSelect(USUARIOS_LISTA_SELECT)).toContain('nombre');
    expect(columnasDelSelect(USUARIOS_LISTA_SELECT)).toContain('rol');
  });
});
