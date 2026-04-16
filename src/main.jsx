import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/AuthContext.jsx'

const { default: DevSwitcher } = await import('./dev/DevSwitcher.jsx')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
      {DevSwitcher && <DevSwitcher />}
    </AuthProvider>
  </StrictMode>
)
