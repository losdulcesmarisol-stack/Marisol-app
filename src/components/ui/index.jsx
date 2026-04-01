// src/components/ui/index.jsx
// Librería de componentes UI reutilizables

import styles from './ui.module.css'

// ─── BUTTON ─────────────────────────────────────────────────────────────────
export function Btn({ children, variant = 'primary', size = 'md', fullWidth, disabled, onClick, type = 'button', ...rest }) {
  const cls = [
    styles.btn,
    styles[`btn-${variant}`],
    styles[`btn-${size}`],
    fullWidth ? styles.fullWidth : '',
    disabled ? styles.btnDisabled : '',
  ].join(' ')
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} {...rest}>
      {children}
    </button>
  )
}

// ─── CARD ────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', style }) {
  return <div className={`${styles.card} ${className}`} style={style}>{children}</div>
}

// ─── CARD TITLE ──────────────────────────────────────────────────────────────
export function CardTitle({ children, action }) {
  return (
    <div className={styles.cardTitle}>
      <span>{children}</span>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── FORM GROUP ──────────────────────────────────────────────────────────────
export function FormGroup({ label, children, error }) {
  return (
    <div className={styles.fg}>
      {label && <label className={styles.fl}>{label}</label>}
      {children}
      {error && <span className={styles.fieldErr}>{error}</span>}
    </div>
  )
}

// ─── TAG / BADGE ─────────────────────────────────────────────────────────────
export function Tag({ children, color = 'purple' }) {
  return <span className={`${styles.tag} ${styles[`tag-${color}`]}`}>{children}</span>
}

// ─── LOADING ─────────────────────────────────────────────────────────────────
export function Loading({ text = 'Cargando...' }) {
  return (
    <div className={styles.loading}>
      <div className="spinner" />
      <span>{text}</span>
    </div>
  )
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────
export function Empty({ icon = '📭', text = 'No hay datos' }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>{icon}</div>
      <p>{text}</p>
    </div>
  )
}

// ─── MODAL ───────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className={styles.moverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`${styles.mdlg} ${wide ? styles.wide : ''} fade-in`}>
        <div className={styles.mtitle}>{title}</div>
        {children}
      </div>
    </div>
  )
}

export function ModalFooter({ children }) {
  return <div className={styles.mfoot}>{children}</div>
}

// ─── GRID ────────────────────────────────────────────────────────────────────
export function Grid2({ children }) { return <div className={styles.g2}>{children}</div> }
export function Grid4({ children }) { return <div className={styles.g4}>{children}</div> }

// ─── TABLE ───────────────────────────────────────────────────────────────────
export function Table({ headers, children, empty }) {
  return (
    <div className={styles.tw}>
      <table className={styles.table}>
        <thead>
          <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <Empty {...empty} />}
    </div>
  )
}

// ─── SECTION HEADER ──────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className={styles.sh}>
      <div>
        <h2 className={styles.shTitle}>{title}</h2>
        {subtitle && <p className={styles.shSub}>{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ─── LOCK OVERLAY ────────────────────────────────────────────────────────────
export function LockOverlay({ visible }) {
  if (!visible) return null
  return (
    <div className={styles.lock}>
      <div>
        <div style={{ fontSize: 32, marginBottom: 7 }}>🔒</div>
        <p style={{ fontSize: 12, color: 'var(--txt2)' }}>Solo administradores</p>
      </div>
    </div>
  )
}

// ─── FILTER TABS ─────────────────────────────────────────────────────────────
export function FilterTabs({ tabs, active, onChange }) {
  return (
    <div className={styles.ftabs}>
      {tabs.map((t) => (
        <button
          key={t.value}
          className={`${styles.ftab} ${active === t.value ? styles.ftabOn : ''}`}
          onClick={() => onChange(t.value)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
export function StatCard({ icon, value, label, diff, diffUp }) {
  return (
    <div className={styles.sc}>
      <div className={styles.sci}>{icon}</div>
      <div className={styles.scv}>{value}</div>
      <div className={styles.scl}>{label}</div>
      {diff !== undefined && (
        <div className={`${styles.scd} ${diffUp === true ? styles.sup : diffUp === false ? styles.sdn : ''}`}>
          {diff}
        </div>
      )}
    </div>
  )
}

// ─── BANNER ──────────────────────────────────────────────────────────────────
export function Banner({ children }) {
  return <div className={styles.dbn}>{children}</div>
}
