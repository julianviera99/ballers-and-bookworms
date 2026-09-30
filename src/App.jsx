import { BrowserRouter, Routes, Route } from 'react-router-dom'

// Public
import Landing from './pages/Landing'
import Demo    from './pages/Demo'

// Admin
import AdminLogin    from './pages/admin/AdminLogin'
import AdminHome     from './pages/admin/AdminHome'
import SchoolDatabase from './pages/admin/SchoolDatabase'
import SchoolEdit    from './pages/admin/SchoolEdit'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public — the eligibility tool itself, no login */}
        <Route path="/"     element={<Landing />} />
        <Route path="/demo" element={<Demo />} />

        {/* Admin */}
        <Route path="/admin/login"             element={<AdminLogin />} />
        <Route path="/admin"                   element={<AdminHome />} />
        <Route path="/admin/schools"           element={<SchoolDatabase />} />
        <Route path="/admin/schools/:ceebCode" element={<SchoolEdit />} />
      </Routes>
    </BrowserRouter>
  )
}
