import Nav from '../../components/Nav'
import ProtectedRoute from '../../components/ProtectedRoute'

function FindMentorContent() {
  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold text-white uppercase tracking-wide">Find a Mentor</h1>
          <p className="text-white/50 text-sm mt-0.5">Browse mentors matched to your sport, goals, and interests.</p>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
          <p className="text-gray-400 text-sm font-medium">Mentor matching is coming soon.</p>
          <p className="text-gray-300 text-xs mt-1">Check back here to browse and request a mentor.</p>
        </div>
      </main>
    </div>
  )
}

export default function FindMentor() {
  return (
    <ProtectedRoute>
      <FindMentorContent />
    </ProtectedRoute>
  )
}
