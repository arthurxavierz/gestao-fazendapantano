import { ClipboardCheck, FileText, Home, List, LogOut, Menu, Plus, ShieldCheck, Stethoscope, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { roleLabel, useAuth } from '../AuthContext'
import { isSupabaseConfigured } from '../services/supabase'
import { Brand } from './Brand'

const baseLinks = [
  { to: '/', label: 'Início', icon: Home },
  { to: '/animais', label: 'Animais', icon: List },
  { to: '/contagens', label: 'Contagens', icon: ClipboardCheck },
  { to: '/ocorrencias', label: 'Ocorrências', icon: Stethoscope },
  { to: '/relatorios', label: 'Documentos', icon: FileText }
]

const adminLink = { to: '/administracao', label: 'Administração', icon: ShieldCheck }

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { isAdmin, role, displayName, signOut } = useAuth()

  const links = isAdmin ? [...baseLinks, adminLink] : baseLinks
  // No celular a barra inferior comporta cinco itens com conforto.
  const bottomLinks = isAdmin ? [...baseLinks.slice(0, 4), adminLink] : baseLinks

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <Brand />
          <button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>

        <nav className="main-nav">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setMenuOpen(false)}>
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="sidebar-user-name">{displayName}</span>
            <span className={`role-badge role-${role}`}>{roleLabel[role]}</span>
          </div>
          <div className="connection-note">
            <span className={`connection-dot ${isSupabaseConfigured ? 'online' : ''}`} />
            {isSupabaseConfigured ? 'Banco conectado' : 'Modo demonstração'}
          </div>
          <button className="text-button" onClick={() => void handleSignOut()}><LogOut size={18} /> Sair</button>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <Brand compact />
          <span className={`role-badge role-${role} topbar-role`}>{roleLabel[role]}</span>
          <button className="button button-primary top-add" onClick={() => navigate('/animais/novo')}>
            <Plus size={18} /> Cadastrar animal
          </button>
        </header>
        <main className="page"><Outlet /></main>
      </div>

      <nav className="bottom-nav">
        {bottomLinks.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
