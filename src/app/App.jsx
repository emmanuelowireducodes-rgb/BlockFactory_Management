import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import AppRoutes from './AppRoutes'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
