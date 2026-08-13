import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ENABLE_BUDGETING, ENABLE_MENTORSHIP, ENABLE_ELIGIBILITY } from './lib/features'

// Public
import Landing     from './pages/Landing'
import MentorApply from './pages/MentorApply'
import Demo        from './pages/Demo'
import NoAccess    from './pages/NoAccess'
import InviteAccept from './pages/InviteAccept'

// Student athlete (StudentRoute inside each page)
import Dashboard  from './pages/Dashboard'
import Profile    from './pages/Profile'
import NewRequest from './pages/NewRequest'
import FindMentor   from './pages/mentors/FindMentor'
import MyMatches    from './pages/mentors/MyMatches'
import Eligibility  from './pages/Eligibility'

// Admin (AdminRoute inside each page)
import StaffDashboard     from './pages/staff/StaffDashboard'
import AthletesList       from './pages/staff/AthletesList'
import AthleteView        from './pages/staff/AthleteView'
import MentorApplications from './pages/staff/MentorApplications'
import MentorsList        from './pages/staff/MentorsList'
import MentorMatches      from './pages/staff/MentorMatches'
import SchoolDatabase     from './pages/staff/SchoolDatabase'
import SchoolEdit         from './pages/staff/SchoolEdit'
import UserManagement     from './pages/staff/UserManagement'
import UserProfile        from './pages/staff/UserProfile'
import InviteUser         from './pages/staff/InviteUser'

// School staff (SchoolStaffRoute inside each page)
import StaffAthletesList  from './pages/school-staff/StaffAthletesList'
import StaffAthleteView   from './pages/school-staff/StaffAthleteView'
import StaffSchoolCourses from './pages/school-staff/StaffSchoolCourses'

function FeatureGate({ enabled, children }) {
  return enabled ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/"              element={<Landing />} />
        <Route path="/demo"          element={<Demo />} />
        <Route path="/mentor/apply"  element={<MentorApply />} />
        <Route path="/no-access"     element={<NoAccess />} />
        <Route path="/invite/:token" element={<InviteAccept />} />

        {/* Student athlete */}
        <Route path="/dashboard"       element={<Dashboard />} />
        <Route path="/profile"         element={<Profile />} />
        <Route path="/requests/new"    element={<FeatureGate enabled={ENABLE_BUDGETING}><NewRequest /></FeatureGate>} />
        <Route path="/mentors/find"    element={<FeatureGate enabled={ENABLE_MENTORSHIP}><FindMentor /></FeatureGate>} />
        <Route path="/mentors/matches" element={<FeatureGate enabled={ENABLE_MENTORSHIP}><MyMatches /></FeatureGate>} />
        <Route path="/eligibility"     element={<FeatureGate enabled={ENABLE_ELIGIBILITY}><Eligibility /></FeatureGate>} />

        {/* Admin */}
        <Route path="/admin"                       element={<StaffDashboard />} />
        <Route path="/admin/athletes"              element={<AthletesList />} />
        <Route path="/admin/athletes/:id"          element={<AthleteView />} />
        <Route path="/admin/mentors/applications"  element={<MentorApplications />} />
        <Route path="/admin/mentors"               element={<MentorsList />} />
        <Route path="/admin/mentors/matches"       element={<MentorMatches />} />
        <Route path="/admin/schools"               element={<SchoolDatabase />} />
        <Route path="/admin/schools/:ceebCode"     element={<SchoolEdit />} />
        <Route path="/admin/users"                 element={<UserManagement />} />
        <Route path="/admin/users/invite"          element={<InviteUser />} />
        <Route path="/admin/users/:id"             element={<UserProfile />} />

        {/* Legacy /staff/* redirects */}
        <Route path="/staff"                       element={<Navigate to="/admin" replace />} />
        <Route path="/staff/*"                     element={<Navigate to="/admin" replace />} />

        {/* School staff */}
        <Route path="/school-staff"              element={<Navigate to="/school-staff/athletes" replace />} />
        <Route path="/school-staff/athletes"     element={<StaffAthletesList />} />
        <Route path="/school-staff/athletes/:id" element={<StaffAthleteView />} />
        <Route path="/school-staff/courses"      element={<FeatureGate enabled={ENABLE_ELIGIBILITY}><StaffSchoolCourses /></FeatureGate>} />
      </Routes>
    </BrowserRouter>
  )
}
