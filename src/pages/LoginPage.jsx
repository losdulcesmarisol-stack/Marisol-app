import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import styles from './LoginPage.module.css'

const URL = 'https://lkcoxxcwtsvdyjeyyqll.supabase.co'
const KEY = 'sb_publishable_Il4ay0whxQIXDTdZ-0tvCQ_uR7-FUKj'

export default function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()
  const [usuarios, setUsuarios] = useState([])
  const [selId, setSelId] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (user) navigate('/', { replace: true }) }, [user])

  useEffect(() => {
    fetch(`${URL}/rest/v1/usuarios?select=id,nombre,pin,rol&activo=eq.true&order=nombre`, {
      headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
    })
    .then(r => r.json())
    .then(data => { setUsuarios(data || []); if (data?.length) setSelId(data[0].id) })
    .catch(e => setError('Sin conexión: ' + e.message))
    .finally(() => setLoading(false))
  }, [])

  function pressKey(k) {
    setError('')
    if (k === 'C') { setPin(''); return }
    if (k === 'OK') { doLogin(pin); return }
    if (pin.length >= 4) return
    const p = pin + String(k)
    setPin(p)
    if (p.length === 4) setTimeout(() => doLogin(p), 200)
  }

  function doLogin(p) {
    if (!selId) { setError('Selecciona un usuario'); return }
    const u = usuarios.find(x => x.id === selId)
    if (!u) { setError('Usuario no encontrado'); return }
    if (p !== u.pin) {
      setError('PIN incorrecto — esperado: ' + u.pin)
      setPin('')
      return
    }
    login({ id: u.id, nombre: u.nombre, rol: u.rol })
    toast.success('Bienvenida, ' + u.nombre)
    navigate('/', { replace: true })
  }

  const keys = ['1','2','3','4','5','6','7','8','9','C','0','OK']

  return (
    <div className={styles.wrapper}>
      <div className={styles.box}>
        <div style={{fontSize:52,marginBottom:8}}>🥖</div>
        <h1 className={styles.title}>Productos MariSol</h1>
        <p className={styles.sub}>Artesanal · Con amor</p>
        {loading ? <p style={{padding:20,color:'#888'}}>Conectando...</p> : <>
          <div className={styles.field}>
            <label>Tu usuario</label>
            <select value={selId} onChange={e=>{setSelId(e.target.value);setPin('');setError('')}}>
              <option value="">-- Selecciona --</option>
              {usuarios.map(u=><option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
            </select>
          </div>
          <p className={styles.pinLabel}>PIN de acceso</p>
          <div className={styles.dots}>
            {[0,1,2,3].map(i=><div key={i} className={`${styles.dot} ${i<pin.length?styles.dotOn:''}`}/>)}
          </div>
          <div className={styles.pad}>
            {keys.map(k=>(
              <button key={k} className={`${styles.pk} ${k==='OK'?styles.pkOk:''}`} onClick={()=>pressKey(k)}>
                {k==='C'?'✕':k==='OK'?'✓':k}
              </button>
            ))}
          </div>
          {error && <p className={styles.err}>{error}</p>}
          <p style={{fontSize:10,color:'#bbb',marginTop:6}}>{usuarios.length} usuario(s) cargados</p>
        </>}
      </div>
    </div>
  )
}
