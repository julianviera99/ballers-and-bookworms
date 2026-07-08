import Nav from '../../components/Nav'
import SchoolStaffRoute from '../../components/SchoolStaffRoute'

function SchoolStaffDashboardContent() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 uppercase tracking-wide mb-6">
          My Athletes
        </h1>
        <p className="text-sm text-gray-500">School staff dashboard — coming soon.</p>
      </main>
    </div>
  )
}

export default function SchoolStaffDashboard() {
  return (
    <SchoolStaffRoute>
      <SchoolStaffDashboardContent />
    </SchoolStaffRoute>
  )
}
