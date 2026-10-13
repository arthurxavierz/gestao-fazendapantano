import {
  Baby,
  ClipboardList,
  Database,
  Hash,
  LayoutDashboard,
  ListChecks,
  NotebookPen,
  ScanSearch,
  Upload,
  LogOut,
  Menu,
  PawPrint,
  Plus,
  RotateCcw,
  Scale,
  Search,
  Shield,
  Sparkles,
  Syringe,
  Users,
  Dna,
  X,
  type LucideIcon
} from 'lucide-react'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useFazenda } from '../AppContext'
import { roleLabel, useAuth } from '../AuthContext'
import { ativo, mesmoBrinco } from '../domain/regras'
import { reiniciarDemonstracao } from '../services/banco'
import { isSupabaseConfigured } from '../services/supabase'
import { Brand } from './Brand'
import { ErrorBoundary } from './ErrorBoundary'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  adminOnly?: boolean
  end?: boolean
}

const navGroups: { title: string; items: NavItem[] }[] = [
  { title: 'Visão geral', items: [{ to: '/', label: 'Painel', icon: LayoutDashboard, end: true }] },
  {
    title: 'Rebanho',
    items: [
      { to: '/animais', label: 'Animais', icon: PawPrint, end: true },
      { to: '/revisao', label: 'Revisão do cadastro', icon: ScanSearch },
      { to: '/animais/importar', label: 'Importar animais', icon: Upload },
      { to: '/femeas', label: 'Fêmeas e IATF', icon: Dna },
      { to: '/bezerros', label: 'Bezerros', icon: Baby },
      { to: '/numeros', label: 'Números disponíveis', icon: Hash }
    ]
  },
  {
    title: 'Manejo',
    items: [
      { to: '/manejos/lote', label: 'Manejo em lote', icon: ListChecks },
      { to: '/manejos', label: 'Histórico de manejos', icon: Syringe, end: true }
    ]
  },
  {
    title: 'Campo e IMA',
    items: [
      { to: '/fichas', label: 'Fichas de campo', icon: NotebookPen },
      { to: '/quadro', label: 'Quadro de campo', icon: ClipboardList },
      { to: '/ima', label: 'Comparar com o IMA', icon: Shield }
    ]
  },
  { title: 'Gestão', items: [{ to: '/contas', label: 'Contas e acessos', icon: Users, adminOnly: true }] }
]

/** Atalhos do botão "Novo registro". */
const quickActions: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/animais?novo=1', label: 'Cadastrar animal', hint: 'Brinco, foto e dados', icon: PawPrint },
  { to: '/animais/completar', label: 'Completar cadastro', hint: 'Sexo e faixa, um por um', icon: Sparkles },
  { to: '/manejos/lote', label: 'Manejo em lote', hint: 'Vacinar vários, marcar quem faltou', icon: ListChecks },
  { to: '/femeas', label: 'Protocolo ou parto', hint: 'Abrir a vaca e lançar', icon: Dna },
  { to: '/fichas', label: 'Ficha de campo', hint: 'Imprimir ou ler a folha marcada', icon: NotebookPen },
  { to: '/animais/importar', label: 'Importar animais', hint: 'Planilha ou fotos em lote', icon: Upload },
  { to: '/quadro?aba=lancar', label: 'Lançar do quadro', hint: 'O que foi anotado no campo', icon: ClipboardList },
  { to: '/manejos?novo=1', label: 'Manejo de um animal', hint: 'Vacina, remédio, pesagem', icon: Scale }
]

export function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, role, displayName, signOut } = useAuth()
  const { dados, bancoDesatualizado } = useFazenda()
  const quickRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMenuOpen(false)
    setQuickOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!quickOpen) return
    const close = (event: MouseEvent) => {
      const target = event.target as Element
      if (quickRef.current?.contains(target) || target.closest?.('.quick-sheet') || target.closest?.('.bottom-fab')) return
      setQuickOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [quickOpen])

  function resetDemo() {
    if (!window.confirm('Reiniciar a demonstração? Tudo o que foi lançado neste navegador volta ao rebanho da planilha.')) return
    reiniciarDemonstracao()
    window.location.assign('/')
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  /** Busca pelo brinco: achou exato, abre a ficha; senão, abre a lista filtrada. */
  function submitSearch(event: FormEvent) {
    event.preventDefault()
    const value = search.trim().replace(/^x/i, '')
    if (!value) return
    const exact = dados.animais.find((item) => ativo(item) && mesmoBrinco(item.brinco, value))
      ?? dados.animais.find((item) => ativo(item) && item.brinco.replace(/^0+/, '') === value.replace(/^0+/, ''))
    const calf = exact ? null : dados.bezerros.find((item) => mesmoBrinco(item.codigo, value))
    setSearch('')
    if (exact) navigate(`/animais/${exact.id}`)
    else if (calf) navigate(`/bezerros/${calf.id}`)
    else navigate(`/animais?busca=${encodeURIComponent(value)}`)
  }

  const today = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

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
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end}>
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
            {isSupabaseConfigured ? 'Banco conectado' : 'Demonstração no navegador'}
          </div>
          <div className="sidebar-actions">
            <button className="text-button sidebar-signout" onClick={() => void handleSignOut()}><LogOut size={17} /> Sair</button>
            {!isSupabaseConfigured && (
              <button className="text-button sidebar-signout" onClick={resetDemo} title="Volta ao rebanho da planilha"><RotateCcw size={15} /> Reiniciar demo</button>
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
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar brinco…" inputMode="search" aria-label="Buscar animal pelo brinco" />
            <kbd>Enter</kbd>
          </form>
          <span className="topbar-date">{today}</span>
          <div className="quick-wrap" ref={quickRef}>
            <button className="button button-primary top-add" onClick={() => setQuickOpen((value) => !value)} aria-expanded={quickOpen}>
              <Plus size={18} /> <span>Novo registro</span>
            </button>
            {quickOpen && <QuickMenu onPick={(to) => navigate(to)} />}
          </div>
        </header>

        {bancoDesatualizado && (
          <div className="schema-banner">
            <Database size={18} />
            <div>
              <strong>O banco ainda não tem as tabelas do rebanho.</strong>{' '}
              {isAdmin ? 'Execute supabase/schema.sql e depois supabase/rebanho-planilha.sql no SQL Editor do Supabase.' : 'Avise o administrador.'}
            </div>
          </div>
        )}

        <main className="page"><ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary></main>
      </div>

      <nav className="bottom-nav">
        <NavLink to="/" end><LayoutDashboard size={21} /><span>Painel</span></NavLink>
        <NavLink to="/animais"><PawPrint size={21} /><span>Animais</span></NavLink>
        <button className={`bottom-fab ${quickOpen ? 'is-open' : ''}`} onClick={() => setQuickOpen((value) => !value)} aria-label="Novo registro"><Plus size={26} /></button>
        <NavLink to="/femeas"><Dna size={21} /><span>Fêmeas</span></NavLink>
        <NavLink to="/manejos/lote"><ListChecks size={21} /><span>Manejo</span></NavLink>
      </nav>

      {quickOpen && (
        <div className="quick-sheet-backdrop" onClick={() => setQuickOpen(false)}>
          <div className="quick-sheet" onClick={(e) => e.stopPropagation()}>
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
