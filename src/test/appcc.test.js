import { describe, it, expect } from 'vitest'
import { loteDe, tocaLimpiar, tareasDelDia, fueraRango, rangoTxt, ordenUso, udsProduccion, proximaLimpieza } from '../lib/appcc'

describe('lote de fabricación', () => {
  it('es la fecha en 8 cifras ddmmaaaa', () => {
    expect(loteDe('2026-11-23')).toBe('23112026')
    expect(loteDe('2027-01-05')).toBe('05012027')
  })
})

describe('plan de limpieza', () => {
  const diaria = { id: 'a', activo: true, cada_dias: 1, proxima: '2026-11-23', created_at: '2026-11-23T10:00:00Z' }
  const hornos = { id: 'b', activo: true, cada_dias: 14, proxima: '2026-11-25', created_at: '2026-11-23T10:00:00Z' }
  it('la diaria toca todos los días', () => {
    expect(tocaLimpiar(diaria, '2026-11-24')).toBe(true)
    expect(tocaLimpiar(diaria, '2027-03-01')).toBe(true)
  })
  it('la de cada 2 semanas toca en su día y cada 14 días', () => {
    expect(tocaLimpiar(hornos, '2026-11-25')).toBe(true)
    expect(tocaLimpiar(hornos, '2026-12-09')).toBe(true)
    expect(tocaLimpiar(hornos, '2026-11-26')).toBe(false)
  })
  it('no cuenta días anteriores a dar de alta la tarea', () => {
    expect(tareasDelDia([diaria], '2026-11-22')).toEqual([])
    expect(tareasDelDia([diaria], '2026-11-23').length).toBe(1)
  })
  it('próxima limpieza', () => {
    expect(proximaLimpieza(hornos, '2026-11-26')).toBe('2026-12-09')
  })
})

describe('temperaturas', () => {
  const frigo = { t_min: 0, t_max: 4 }; const cong = { t_min: null, t_max: -18 }
  it('frigorífico entre 0 y 4 °C', () => {
    expect(fueraRango(frigo, 3.9)).toBe(false); expect(fueraRango(frigo, 4.1)).toBe(true); expect(fueraRango(frigo, -0.5)).toBe(true)
  })
  it('congelador a -18 °C o menos, sin mínimo', () => {
    expect(fueraRango(cong, -25)).toBe(false); expect(fueraRango(cong, -17.5)).toBe(true)
    expect(rangoTxt(cong)).toMatch(/o menos/)
  })
})

describe('stock', () => {
  it('se usa primero lo sin caducidad conocida y luego lo que antes caduca', () => {
    const ls = [{ caducidad: '2027-01-01', created_at: 'b' }, { caducidad: null, created_at: 'a' }, { caducidad: '2026-12-01', created_at: 'c' }]
    expect(ls.sort(ordenUso).map(l => l.caducidad)).toEqual([null, '2026-12-01', '2027-01-01'])
  })
  it('unidades de la hoja de producción: cocidas, o masa si no hay', () => {
    expect(udsProduccion({ cocidas: '141', masa: '143' })).toBe(141)
    expect(udsProduccion({ cocidas: '', masa: '10' })).toBe(10)
    expect(udsProduccion({ cocidas: '2,5' })).toBe(2.5)
    expect(udsProduccion({})).toBe(0)
  })
})
