import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './AppContext'
import { AuthProvider, useAuth } from './AuthContext'
import { Layout } from './components/Layout'
import { Loading } from './components/Loading'
import { HerdProvider } from './hooks/useHerd'
import { Admin } from './pages/Admin'
import { Agenda } from './pages/Agenda'
import { AnimalDetail } from './pages/AnimalDetail'
import { AnimalForm } from './pages/AnimalForm'
import { Animals } from './pages/Animals'
import { BulkAnimals } from './pages/BulkAnimals'
import { Counts } from './pages/Counts'
import { Dashboard } from './pages/Dashboard'
import { ImportAnimals } from './pages/ImportAnimals'
import { Login } from './pages/Login'
import { Manejo } from './pages/Manejo'
import { Occurrences } from './pages/Occurrences'
import { PurchaseDetail, Purchases } from './pages/Purchases'
import { Reports } from './pages/Reports'
import { Reproduction } from './pages/Reproduction'
import { Settings } from './pages/Settings'

function ProtectedLayout() {
  const { loading, authenticated } = useAuth()
  if (loading) return <Loading />
  if (!authenticated) return <Navigate to="/login" replace />
  return (
    <AppProvider>
      <HerdProvider>
        <Layout />
      </HerdProvider>
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
          <Route path="animais/importar" element={<AdminOnly><ImportAnimals /></AdminOnly>} />
          <Route path="animais/lote" element={<BulkAnimals />} />
          <Route path="animais/:id" element={<AnimalDetail />} />
          <Route path="animais/:id/editar" element={<AnimalForm />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="reproducao" element={<Reproduction />} />
          <Route path="manejo" element={<Manejo />} />
          <Route path="compras" element={<Purchases />} />
          <Route path="compras/:id" element={<PurchaseDetail />} />
          <Route path="contagens" element={<Counts />} />
          <Route path="ocorrencias" element={<Occurrences />} />
          <Route path="relatorios" element={<Reports />} />
          <Route path="administracao" element={<AdminOnly><Admin /></AdminOnly>} />
          <Route path="configuracoes" element={<AdminOnly><Settings /></AdminOnly>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
