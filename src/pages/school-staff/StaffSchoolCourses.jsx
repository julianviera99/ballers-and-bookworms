import { useAuth } from '../../lib/AuthContext'
import Nav from '../../components/Nav'
import SchoolStaffRoute from '../../components/SchoolStaffRoute'
import { SchoolEditContent } from '../staff/SchoolEdit'

function StaffSchoolCoursesContent() {
  const { schoolId } = useAuth()

  // Staff with no assigned school can't manage courses — no CEEB to scope to.
  if (!schoolId) {
    return (
      <div className="min-h-screen bg-gray-100">
        <Nav />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center text-gray-500">
          Your account isn't linked to a school yet. Contact an admin to be assigned one.
        </div>
      </div>
    )
  }

  return (
    <SchoolEditContent
      ceebCode={schoolId}
      backHref="/school-staff"
      backLabel="My Athletes"
      notFoundMessage="Your school isn't in the NCAA database yet. Contact an admin to add it."
    />
  )
}

export default function StaffSchoolCourses() {
  return (
    <SchoolStaffRoute>
      <StaffSchoolCoursesContent />
    </SchoolStaffRoute>
  )
}
