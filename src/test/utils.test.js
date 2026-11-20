// src/test/setup.js
import '@testing-library/jest-dom'

// src/test/utils.test.js
import { describe, it, expect } from 'vitest'
import { fmt, todayStr, getDiaPanadero, validarPin, noVacio, labelFecha } from '../lib/utils'

describe('fmt - formato moneda', () => {
  it('formatea entero correctamente', () => {
    expect(fmt(10)).toContain('10')
    expect(fmt(10)).toContain('€')
  })
  it('formatea decimal correctamente', () => {
    expect(fmt(3.5)).toContain('3')
  })
  it('maneja cero', () => {
    expect(fmt(0)).toContain('0')
  })
  it('maneja undefined/null', () => {
    expect(() => fmt(undefined)).not.toThrow()
    expect(() => fmt(null)).not.toThrow()
  })
})

describe('todayStr', () => {
  it('devuelve formato YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getDiaPanadero', () => {
  it('devuelve objeto con fechaEntrega, turno y label', () => {
    const dp = getDiaPanadero()
    expect(dp).toHaveProperty('fechaEntrega')
    expect(dp).toHaveProperty('turno')
    expect(dp).toHaveProperty('label')
    expect(dp.fechaEntrega).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(['tarde','noche','mañana']).toContain(dp.turno)
  })
})

describe('validarPin', () => {
  it('acepta 4 dígitos', () => { expect(validarPin('1234')).toBe(true) })
  it('rechaza menos de 4', () => { expect(validarPin('123')).toBe(false) })
  it('rechaza más de 4', () => { expect(validarPin('12345')).toBe(false) })
  it('rechaza letras', () => { expect(validarPin('ab12')).toBe(false) })
  it('rechaza vacío', () => { expect(validarPin('')).toBe(false) })
})

describe('noVacio', () => {
  it('acepta texto con contenido', () => { expect(noVacio('Marisol')).toBe(true) })
  it('rechaza string vacío', () => { expect(noVacio('')).toBe(false) })
  it('rechaza solo espacios', () => { expect(noVacio('   ')).toBe(false) })
})

describe('labelFecha', () => {
  it('devuelve emoji Hoy para hoy', () => {
    expect(labelFecha(todayStr())).toContain('Hoy')
  })
  it('devuelve emoji Mañana para mañana', () => {
    const man = (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10) })()
    expect(labelFecha(man)).toContain('Mañana')
  })
  it('devuelve emoji Ayer para ayer', () => {
    const ay = (() => { const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10) })()
    expect(labelFecha(ay)).toContain('Ayer')
  })
})

// ── Hora de España (antes se usaba UTC y de madrugada salía el día anterior) ──
import { vi, afterEach } from 'vitest'
import { fechaES, horaStr, sumarDias } from '../lib/utils'

describe('fechas en hora de España', () => {
  afterEach(() => vi.useRealTimers())

  it('a las 00:44 de España (invierno) ya es el día nuevo', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-13T23:44:00Z')) // 00:44 del 14 en España
    expect(todayStr()).toBe('2026-11-14')
    expect(horaStr()).toBe('00:44')
    expect(getDiaPanadero().fechaEntrega).toBe('2026-11-14')
    expect(getDiaPanadero().turno).toBe('madrugada')
  })
  it('a la 01:30 de España (verano, UTC+2) ya es el día nuevo', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-07-25T23:30:00Z')) // 01:30 del 26 en España
    expect(todayStr()).toBe('2026-07-26')
    expect(getDiaPanadero().fechaEntrega).toBe('2026-07-26')
  })
  it('a partir de las 10:00 los pedidos son para mañana', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-12-31T10:15:00Z')) // 11:15 del 31 en España
    expect(getDiaPanadero().fechaEntrega).toBe('2027-01-01')
  })
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('fechaES de un momento concreto', () => {
    expect(fechaES(new Date('2026-03-29T22:30:00Z'))).toBe('2026-03-30') // cambio de hora
  })
})
