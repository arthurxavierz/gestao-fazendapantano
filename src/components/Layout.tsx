import {
  ArrowLeftRight,
  CalendarDays,
  ClipboardCheck,
  Database,
  FileText,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  PawPrint,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Stethoscope,
  Syringe,
  Dna,
  X,
  type LucideIcon
} from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppData } from '../AppContext'
import { roleLabel, useAuth } from '../AuthContext'
import { isSupabaseConfigured } from '../services/supabase'
import { Brand } from './Brand'
import { ErrorBoundary } from './ErrorBoundary'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
}

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Visão geral',
    items: [
      { to: '/', label: 'Painel', icon: LayoutDashboard },
      { to: '/agenda', label: 'Agenda', icon: CalendarDays }
    ]
  },
  {
    title: 'Rebanho',
    items: [
      { to: '/animais', label: 'Animais', icon: PawPrint },
      { to: '/compras', label: 'Compras e lotes', icon: ShoppingCart },
      { to: '/contagens', label: 'Contagens', icon: ClipboardCheck }
    ]
  },
  {
    title: 'Manejo',
    items: [
      { to: '/reproducao', label: 'Reprodução', icon: Dna },
      { to: '/manejo', label: 'Sanitário e pesagem', icon: Syringe },
      { to: '/ocorrencias', label: 'Ocorrências', icon: Stethoscope }
    ]
  },
  {
    title: 'Gestão',
    items: [
      { to: '/relatorios', label: 'Documentos', icon: FileText },
      { to: '/administracao', label: 'Administração', icon: ShieldCheck, adminOnly: true },
      { to: '/configuracoes', label: 'Regras da fazenda', icon: Settings2, adminOnly: true }
    ]
  }
]

/** Atalhos do botão "Novo registro". Cada um abre direto o formulário certo. */
const quickActions: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/animais/novo', label: 'Cadastrar animal', hint: 'Com foto e leitura do brinco', icon: PawPrint },
  { to: '/manejo?acao=pesagem', label: 'Pesagem', hint: 'Pesar um lote no curral', icon: Scale },
  { to: '/manejo?acao=vacina', label: 'Vacina ou remédio', hint: 'Aplicar em um ou vários', icon: Syringe },
  { to: '/reproducao?acao=protocolo', label: 'Iniciar protocolo', hint: 'IATF ou monta', icon: Dna },
  { to: '/manejo?acao=movimentar', label: 'Movimentação', hint: 'Trocar de lote, venda, abate', icon: ArrowLeftRight },
  { to: '/ocorrencias?nova=1', label: 'Ocorrência', hint: 'Doença, observação, morte', icon: HeartPulse },
  { to: '/contagens?nova=1', label: 'Contagem', hint: 'Conferir um curral ou pasto', icon: ClipboardCheck }
]

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [searchMessage, setSearchMessage] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, role, displayName, signOut } = useAuth()
  const { animals, missingTables, schemaOutdated } = useAppData()
  const quickRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMenuOpen(false)
    setQuickOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!quickOpen) return
    const close = (event: MouseEvent) => {
      // O menu do computador e a folha do celular contam como "dentro": tocar
      // num atalho não pode fechar o menu antes do clique chegar ao botão.
      const target = event.target as Node
      if (quickRef.current?.contains(target) || sheetRef.current?.contains(target)) return
      if ((target as Element).closest?.('.bottom-fab')) return
      setQuickOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [quickOpen])

  /** Modo demonstração: apaga o que foi lançado e recarrega o rebanho de exemplo. */
  function resetDemo() {
    if (!window.confirm('Reiniciar a demonstração? Tudo o que foi lançado neste navegador volta ao exemplo inicial.')) return
    try {
      Object.keys(localStorage).filter((key) => key.startsWith('pantano.v2.')).forEach((key) => localStorage.removeItem(key))
    } catch { /* armazenamento indisponível */ }
    window.location.assign('/')
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  /** Busca direta pelo brinco: achou exato, abre a ficha; senão, abre a lista filtrada. */
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const value = search.trim()
    if (!value) return
    const exact = animals.find((item) => item.number.toLowerCase() === value.toLowerCase())
      ?? animals.find((item) => item.number.replace(/^0+/, '') === value.replace(/^0+/, ''))
    setSearch('')
    if (exact) {
      setSearchMessage(null)
      navigate(`/animais/${exact.id}`)
    } else {
      navigate(`/animais?busca=${encodeURIComponent(value)}`)
    }
  }

  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const needsMigration = isSupabaseConfigured && (missingTables.length > 0 || schemaOutdated)

  return (
    <div className="app-shell">
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-head">
          <Brand />
          <button className="icon-button sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X /></button>
        </div>

        <nav className="main-nav">
          {navGroups.map((group) => {
            const items = group.items.filter((item) => !item.adminOnly || isAdmin)
            if (!items.length) return null
            return (
              <div className="nav-group" key={group.title}>
                <span className="nav-group-title">{group.title}</span>
                {items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} end={to === '/'}>
                    <Icon size={19} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar">{displayName.slice(0, 1).toUpperCase()}</span>
            <div>
              <span className="sidebar-user-name">{displayName}</span>
              <span className={`role-badge role-${role}`}>{roleLabel[role]}</span>
            </div>
          </div>
          <div className="connection-note">
            <span className={`connection-dot ${isSupabaseConfigured ? 'online' : ''}`} />
            {isSupabaseConfigured ? 'Banco conectado' : 'Modo demonstração'}
          </div>
          <div className="sidebar-actions">
            <button className="text-button sidebar-signout" onClick={() => void handleSignOut()}><LogOut size={17} /> Sair</button>
            {!isSupabaseConfigured && (
              <button className="text-button sidebar-signout" onClick={resetDemo} title="Volta o rebanho de exemplo ao estado inicial"><RotateCcw size={15} /> Reiniciar demo</button>
            )}
          </div>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu /></button>
          <div className="topbar-brand"><Brand compact /></div>
          <form className="global-search" onSubmit={submitSearch} role="search">
            <Search size={18} />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSearchMessage(null) }}
              placeholder="Buscar brinco…"
              inputMode="search"
              aria-label="Buscar animal pelo brinco"
            />
            <kbd>Enter</kbd>
          </form>
          {searchMessage && <span className="search-message">{searchMessage}</span>}
          <span className="topbar-date">{today}</span>
          <div className="quick-wrap" ref={quickRef}>
            <button className="button button-primary top-add" onClick={() => setQuickOpen((value) => !value)} aria-expanded={quickOpen}>
              <Plus size={18} /> <span>Novo registro</span>
            </button>
            {quickOpen && <QuickMenu onPick={(to) => navigate(to)} />}
          </div>
        </header>

        {needsMigration && (
          <div className="schema-banner">
            <Database size={18} />
            <div>
              <strong>Banco de dados com versão anterior.</strong>{' '}
              {isAdmin
                ? 'Para usar reprodução, sanitário, pesagens e compras, execute o arquivo supabase/schema.sql atualizado no SQL Editor do Supabase. Os dados atuais são preservados.'
                : 'Alguns módulos novos ainda não estão disponíveis. Avise o administrador.'}
            </div>
          </div>
        )}

        <main className="page"><ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary></main>
      </div>

      <nav className="bottom-nav">
        <NavLink to="/" end><LayoutDashboard size={21} /><span>Painel</span></NavLink>
        <NavLink to="/animais"><PawPrint size={21} /><span>Animais</span></NavLink>
        <button className={`bottom-fab ${quickOpen ? 'is-open' : ''}`} onClick={() => setQuickOpen((value) => !value)} aria-label="Novo registro"><Plus size={26} /></button>
        <NavLink to="/reproducao"><Dna size={21} /><span>Reprodução</span></NavLink>
        <NavLink to="/manejo"><Syringe size={21} /><span>Manejo</span></NavLink>
      </nav>

      {quickOpen && (
        <div className="quick-sheet-backdrop" onClick={() => setQuickOpen(false)}>
          <div className="quick-sheet" ref={sheetRef} onClick={(e) => e.stopPropagation()}>
            <span className="quick-sheet-handle" />
            <strong className="quick-sheet-title">O que você quer registrar?</strong>
            <QuickMenu onPick={(to) => navigate(to)} sheet />
          </div>
        </div>
      )}
    </div>
  )
}

function QuickMenu({ onPick, sheet = false }: { onPick: (to: string) => void; sheet?: boolean }) {
  return (
    <div className={sheet ? 'quick-grid' : 'quick-menu'}>
      {quickActions.map(({ to, label, hint, icon: Icon }) => (
        <button key={to} type="button" onClick={() => onPick(to)}>
          <span className="quick-icon"><Icon size={18} /></span>
          <span><strong>{label}</strong><small>{hint}</small></span>
        </button>
      ))}
    </div>
  )
}
