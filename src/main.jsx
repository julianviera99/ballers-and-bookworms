import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'

const DEV_MODE = import.meta.env.VITE_ENABLE_DEV_MODE === 'true'

let DevSwitcher = null
if (DEV_MODE) {
  DevSwitcher = (await import('./dev/DevSwitcher.jsx')).default
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
      {DevSwitcher && <DevSwitcher />}
    </AuthProvider>
  </StrictMode>
)
