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
