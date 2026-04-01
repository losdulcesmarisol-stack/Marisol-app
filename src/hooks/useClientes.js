// src/hooks/useClientes.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export function useClientes() {
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      setClientes(data || [])
    } catch (e) {
      toast.error('Error cargando clientes: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (datos, id) => {
    // Validación
    if (!datos.nombre?.trim()) {
      toast.error('El nombre del cliente es obligatorio')
      return false
    }
    try {
      if (id) {
        const { error } = await supabase.from('clientes').update(datos).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('clientes').insert(datos)
        if (error) throw error
      }
      toast.success('Cliente guardado ✅')
      await load()
      return true
    } catch (e) {
      toast.error('Error al guardar cliente: ' + e.message)
      return false
    }
  }, [load])

  const remove = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('clientes').update({ activo: false }).eq('id', id)
      if (error) throw error
      toast.success('Cliente eliminado 🗑')
      await load()
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }, [load])

  return { clientes, loading, load, save, remove }
}
