import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

function MentorsListContent() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">All Mentors</h1>
          <p className="text-white/50 text-sm mt-0.5">Active, pending, and inactive mentor profiles.</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
          <p className="text-gray-400 text-sm font-medium">No mentor profiles yet.</p>
        </div>
      </main>
    </div>
  )
}

export default function MentorsList() {
  return (
    <StaffRoute>
      <MentorsListContent />
    </StaffRoute>
  )
}
