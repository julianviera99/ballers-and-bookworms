import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'

// DevSwitcher is imported lazily so it's fully excluded from production builds.
// Vite evaluates import.meta.env.DEV at build time and removes dead branches.
const DevSwitcher = import.meta.env.DEV
  ? (await import('./dev/DevSwitcher.jsx')).default
  : null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
      {DevSwitcher && <DevSwitcher />}
    </AuthProvider>
  </StrictMode>
)
