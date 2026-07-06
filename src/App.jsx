import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ENABLE_BUDGETING, ENABLE_MENTORSHIP, ENABLE_ELIGIBILITY } from './lib/features'

// Public
import Landing     from './pages/Landing'
import MentorApply from './pages/MentorApply'
import Demo        from './pages/Demo'

// Student athlete (ProtectedRoute inside each page)
import Dashboard  from './pages/Dashboard'
import Profile    from './pages/Profile'
import NewRequest from './pages/NewRequest'
import FindMentor   from './pages/mentors/FindMentor'
import MyMatches    from './pages/mentors/MyMatches'
import Eligibility  from './pages/Eligibility'

// Staff (StaffRoute inside each page)
import StaffDashboard     from './pages/staff/StaffDashboard'
import AthletesList       from './pages/staff/AthletesList'
import AthleteView        from './pages/staff/AthleteView'
import MentorApplications from './pages/staff/MentorApplications'
import MentorsList        from './pages/staff/MentorsList'
import MentorMatches      from './pages/staff/MentorMatches'

function FeatureGate({ enabled, children }) {
  return enabled ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"             element={<Landing />} />
        <Route path="/demo"         element={<Demo />} />
        <Route path="/mentor/apply" element={<MentorApply />} />

        {/* Student athlete */}
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/profile"         element={<Profile />} />
        <Route path="/requests/new"    element={<FeatureGate enabled={ENABLE_BUDGETING}><NewRequest /></FeatureGate>} />
        <Route path="/mentors/find"    element={<FeatureGate enabled={ENABLE_MENTORSHIP}><FindMentor /></FeatureGate>} />
        <Route path="/mentors/matches" element={<FeatureGate enabled={ENABLE_MENTORSHIP}><MyMatches /></FeatureGate>} />
        <Route path="/eligibility"     element={<FeatureGate enabled={ENABLE_ELIGIBILITY}><Eligibility /></FeatureGate>} />

        {/* Staff */}
        <Route path="/staff"                       element={<StaffDashboard />} />
        <Route path="/staff/athletes"              element={<AthletesList />} />
        <Route path="/staff/athletes/:id"          element={<AthleteView />} />
        <Route path="/staff/mentors/applications"  element={<MentorApplications />} />
        <Route path="/staff/mentors"               element={<MentorsList />} />
        <Route path="/staff/mentors/matches"       element={<MentorMatches />} />
      </Routes>
    </BrowserRouter>
  )
}
