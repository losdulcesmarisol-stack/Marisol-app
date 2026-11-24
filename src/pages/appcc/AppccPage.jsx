// src/pages/appcc/AppccPage.jsx
// Módulo APPCC: control diario, stock, trazabilidad, alérgenos, plan de limpieza,
// recetas e informes para Sanidad.
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { SectionHeader } from '../../components/ui'
import HoyTab from './HoyTab'
import RegistrosTab from './RegistrosTab'
import StockTab from './StockTab'
import TrazaTab from './TrazaTab'
import AlergenosTab from './AlergenosTab'
import PlanTab from './PlanTab'
import RecetasTab from './RecetasTab'
import InformesTab from './InformesTab'
import AjustesTab from './AjustesTab'
import s from './appcc.module.css'

const TABS = [
  { id: 'hoy', label: 'Hoy', C: HoyTab },
  { id: 'stock', label: 'Stock', C: StockTab },
  { id: 'reg', label: 'Registros', C: RegistrosTab },
  { id: 'traza', label: 'Trazabilidad', C: TrazaTab },
  { id: 'aler', label: 'Alérgenos', C: AlergenosTab },
  { id: 'plan', label: 'Plan de limpieza', C: PlanTab },
  { id: 'rec', label: 'Recetas', C: RecetasTab, admin: true },
  { id: 'inf', label: 'Informes PDF', C: InformesTab, admin: true },
  { id: 'ajustes', label: 'Equipos y materias', C: AjustesTab, admin: true },
]

export default function AppccPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('appcc-tab') || 'hoy' } catch { return 'hoy' } })
  const visibles = TABS.filter(t => !t.admin || isAdmin)
  const actual = visibles.find(t => t.id === tab) || visibles[0]
  const elegir = id => { setTab(id); try { sessionStorage.setItem('appcc-tab', id) } catch { /* sin almacenamiento */ } }
  const C = actual.C
  return (
    <div className="fade-in">
      <SectionHeader title="APPCC" subtitle="Autocontrol sanitario: temperaturas, limpieza, lotes, stock y trazabilidad" />
      <nav className={s.tabs} role="tablist">
        {visibles.map(t => (
          <button key={t.id} role="tab" aria-selected={t.id === actual.id} className={`${s.tab} ${t.id === actual.id ? s.tabOn : ''}`} onClick={() => elegir(t.id)}>{t.label}</button>
        ))}
      </nav>
      <C irA={elegir} />
    </div>
  )
}
