import { BrowserRouter, Routes, Route } from 'react-router-dom'

// Public
import Landing     from './pages/Landing'
import MentorApply from './pages/MentorApply'

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"             element={<Landing />} />
        <Route path="/mentor/apply" element={<MentorApply />} />

        {/* Student athlete */}
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/profile"         element={<Profile />} />
        <Route path="/requests/new"    element={<NewRequest />} />
        <Route path="/mentors/find"    element={<FindMentor />} />
        <Route path="/mentors/matches" element={<MyMatches />} />
        <Route path="/eligibility"     element={<Eligibility />} />

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
