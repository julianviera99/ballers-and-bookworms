import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

function MentorApplicationsContent() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Mentor Applications</h1>
          <p className="text-white/50 text-sm mt-0.5">Review and approve incoming mentor applications.</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
          <p className="text-gray-400 text-sm font-medium">No pending applications.</p>
        </div>
      </main>
    </div>
  )
}

export default function MentorApplications() {
  return (
    <StaffRoute>
      <MentorApplicationsContent />
    </StaffRoute>
  )
}
