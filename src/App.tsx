import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { AuthProvider, useAuth } from './AuthContext'
import { Layout } from './components/Layout'
import { Loading } from './components/Loading'
import { Animais } from './pages/Animais'
import { Bezerros, FichaBezerro } from './pages/Bezerros'
import { Completar } from './pages/Completar'
import { Contas } from './pages/Contas'
import { Femeas } from './pages/Femeas'
import { Fichas, LerFicha } from './pages/Fichas'
import { Importar } from './pages/Importar'
import { Revisao } from './pages/Revisao'
import { Ficha } from './pages/Ficha'
import { Ima } from './pages/Ima'
import { Login } from './pages/Login'
import { Lote } from './pages/Lote'
import { Manejos } from './pages/Manejos'
import { Numeros } from './pages/Numeros'
import { Painel } from './pages/Painel'
import { Quadro } from './pages/Quadro'

function ProtectedLayout() {
  const { loading, authenticated } = useAuth()
  if (loading) return <Loading />
  if (!authenticated) return <Navigate to="/login" replace />
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  )
}

/** Rotas exclusivas do administrador. O operador é devolvido ao início. */
function AdminOnly({ children }: { children: React.ReactNode }) {
  const { loading, isAdmin } = useAuth()
  if (loading) return <Loading />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedLayout />}>
          <Route index element={<Painel />} />
          <Route path="animais" element={<Animais />} />
          <Route path="animais/completar" element={<Completar />} />
          <Route path="animais/importar" element={<Importar />} />
          <Route path="revisao" element={<Revisao />} />
          <Route path="fichas" element={<Fichas />} />
          <Route path="fichas/:id" element={<LerFicha />} />
          <Route path="animais/:id" element={<Ficha />} />
          <Route path="femeas" element={<Femeas />} />
          <Route path="bezerros" element={<Bezerros />} />
          <Route path="bezerros/:id" element={<FichaBezerro />} />
          <Route path="numeros" element={<Numeros />} />
          <Route path="manejos" element={<Manejos />} />
          <Route path="manejos/lote" element={<Lote />} />
          <Route path="quadro" element={<Quadro />} />
          <Route path="ima" element={<Ima />} />
          <Route path="contas" element={<AdminOnly><Contas /></AdminOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
