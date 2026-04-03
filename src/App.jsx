import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Profile from './pages/Profile'
import NewRequest from './pages/NewRequest'
import StaffDashboard from './pages/staff/StaffDashboard'
import AthletesList from './pages/staff/AthletesList'
import AthleteView from './pages/staff/AthleteView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/requests/new" element={<NewRequest />} />
        <Route path="/staff" element={<StaffDashboard />} />
        <Route path="/staff/athletes" element={<AthletesList />} />
        <Route path="/staff/athletes/:id" element={<AthleteView />} />
      </Routes>
    </BrowserRouter>
  )
}
