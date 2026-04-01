// src/hooks/useProductos.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { getEmoji } from '../lib/utils'

export function useProductos() {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('productos')
        .select('*')
        .eq('activo', true)
        .order('nombre')
      if (error) throw error
      setProductos(data || [])
    } catch (e) {
      toast.error('Error cargando productos: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (datos, id) => {
    try {
      const ico = datos.icono?.trim() || getEmoji(datos.categoria)
      const payload = { ...datos, icono: ico }
      if (id) {
        const { error } = await supabase.from('productos').update(payload).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('productos').insert(payload)
        if (error) throw error
      }
      toast.success('Producto guardado ✅')
      await load()
      return true
    } catch (e) {
      toast.error('Error: ' + e.message)
      return false
    }
  }, [load])

  const remove = useCallback(async (id) => {
    try {
      const { error } = await supabase.from('productos').update({ activo: false }).eq('id', id)
      if (error) throw error
      toast.success('Producto eliminado 🗑')
      await load()
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }, [load])

  return { productos, loading, load, save, remove }
}
