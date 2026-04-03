import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Nav from '../../components/Nav'
import StaffRoute from '../../components/StaffRoute'

const CATEGORY_LABELS = {
  academic_supplies:    'Academic Supplies',
  athletic_equipment:   'Athletic Equipment',
  tutoring:             'Tutoring',
  athletic_training:    'Athletic Training',
  nutrition_consulting: 'Nutrition Consulting',
  camp_fees:            'Camp Fees',
  travel_costs:         'Travel Costs',
  other:                'Other',
}

function StaffDashboardContent() {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState({})
  const [acting, setActing] = useState({})

  async function load() {
    const { data } = await supabase
      .from('funding_requests')
      .select('*, student_athletes(id, name, school)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setRequests(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleAction(requestId, status) {
    setActing(a => ({ ...a, [requestId]: status }))
    await supabase
      .from('funding_requests')
      .update({ status, staff_note: notes[requestId] ?? null })
      .eq('id', requestId)
    await load()
    setActing(a => { const n = { ...a }; delete n[requestId]; return n })
  }

  async function viewReceipt(path) {
    const { data } = await supabase.storage.from('receipts').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  if (loading) return null

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">
              Pending Requests
              {requests.length > 0 && (
                <span className="ml-2 text-lg font-normal text-white/40">({requests.length})</span>
              )}
            </h1>
            <p className="text-white/50 text-sm mt-0.5">Review and action incoming funding requests.</p>
          </div>
          <Link
            to="/staff/athletes"
            className="self-start sm:self-auto text-sm font-bold text-brand hover:text-brand-dark transition-colors uppercase tracking-wide"
          >
            View all athletes →
          </Link>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-4">

        {requests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-6 py-16 text-center">
            <p className="text-gray-400 text-sm font-medium">All caught up — no pending requests.</p>
          </div>
        ) : (
          requests.map(r => {
            const athlete = r.student_athletes
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-black px-6 py-3 flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white text-sm">{athlete?.name}</span>
                  <span className="text-white/30">·</span>
                  <span className="text-sm text-white/50">{athlete?.school}</span>
                  <Link
                    to={`/staff/athletes/${athlete?.id}`}
                    className="text-xs font-bold text-brand hover:text-brand-dark ml-auto"
                  >
                    View budget →
                  </Link>
                </div>

                <div className="p-6 space-y-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-black">{CATEGORY_LABELS[r.category] ?? r.category}</span>
                      <span className="text-gray-300">·</span>
                      <span className="font-bold text-black">${Number(r.amount).toFixed(2)}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed">{r.description}</p>
                    {r.receipt_url && (
                      <button
                        onClick={() => viewReceipt(r.receipt_url)}
                        className="text-xs font-bold text-black underline underline-offset-2"
                      >
                        View receipt ↗
                      </button>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-gray-100">
                    <input
                      type="text"
                      placeholder="Optional note for student…"
                      value={notes[r.id] ?? ''}
                      onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                    />
                    <button
                      onClick={() => handleAction(r.id, 'approved')}
                      disabled={!!acting[r.id]}
                      className="text-sm font-bold px-5 py-2 rounded-xl transition-colors disabled:opacity-50 bg-black text-white hover:bg-gray-800 uppercase tracking-wide"
                    >
                      {acting[r.id] === 'approved' ? '…' : 'Approve'}
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'flagged')}
                      disabled={!!acting[r.id]}
                      className="text-sm font-bold px-5 py-2 rounded-xl transition-colors disabled:opacity-50 bg-brand text-black hover:bg-brand-dark uppercase tracking-wide"
                    >
                      {acting[r.id] === 'flagged' ? '…' : 'Flag'}
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'denied')}
                      disabled={!!acting[r.id]}
                      className="text-sm font-bold px-5 py-2 rounded-xl transition-colors disabled:opacity-50 bg-gray-100 text-gray-700 hover:bg-gray-200 uppercase tracking-wide"
                    >
                      {acting[r.id] === 'denied' ? '…' : 'Deny'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}

      </main>
    </div>
  )
}

export default function StaffDashboard() {
  return (
    <StaffRoute>
      <StaffDashboardContent />
    </StaffRoute>
  )
}
