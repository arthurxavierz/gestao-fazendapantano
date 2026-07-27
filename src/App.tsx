import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { AuthProvider, useAuth } from './AuthContext'
import { Layout } from './components/Layout'
import { Loading } from './components/Loading'
import { Admin } from './pages/Admin'
import { AnimalDetail } from './pages/AnimalDetail'
import { AnimalForm } from './pages/AnimalForm'
import { Animals } from './pages/Animals'
import { Counts } from './pages/Counts'
import { Dashboard } from './pages/Dashboard'
import { Login } from './pages/Login'
import { Occurrences } from './pages/Occurrences'
import { Reports } from './pages/Reports'

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
          <Route index element={<Dashboard />} />
          <Route path="animais" element={<Animals />} />
          <Route path="animais/novo" element={<AnimalForm />} />
          <Route path="animais/:id" element={<AnimalDetail />} />
          <Route path="animais/:id/editar" element={<AnimalForm />} />
          <Route path="contagens" element={<Counts />} />
          <Route path="ocorrencias" element={<Occurrences />} />
          <Route path="relatorios" element={<Reports />} />
          <Route path="administracao" element={<AdminOnly><Admin /></AdminOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
