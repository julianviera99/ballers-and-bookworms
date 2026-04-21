import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import Nav from '../components/Nav'
import ProtectedRoute from '../components/ProtectedRoute'

const SUPABASE_URL   = import.meta.env.VITE_SUPABASE_URL
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']
const MAX_BYTES      = 10 * 1024 * 1024 // 10 MB

const STATUS_CFG = {
  on_track:        { label: 'On Track',       banner: 'bg-green-500  text-white', badge: 'bg-green-100  text-green-800'  },
  at_risk:         { label: 'At Risk',         banner: 'bg-yellow-400 text-black', badge: 'bg-yellow-100 text-yellow-800' },
  needs_attention: { label: 'Needs Attention', banner: 'bg-red-500    text-white', badge: 'bg-red-100    text-red-800'    },
}

// NCAA category labels → short form for table
const CAT_SHORT = {
  'English':                                                    'English',
  'Mathematics':                                                'Mathematics',
  'Natural/Physical Science':                                   'Science',
  'Social Science':                                             'Social Science',
  'Foreign Language/Comparative Religion and Philosophy':       'Foreign Lang.',
  'Additional Academic':                                        'Additional',
  'Not Approved':                                               'Not Approved',
  'Non-Core':                                                   'Non-Core',
}

// Category colour dots in the checklist
const CAT_DOT = {
  'English':                   'bg-blue-500',
  'Mathematics':               'bg-purple-500',
  'Natural/Physical Science':  'bg-green-500',
  'Social Science':            'bg-orange-500',
}

// ── Helper components ─────────────────────────────────────────────────────────

function Spinner({ className = 'w-8 h-8' }) {
  return (
    <svg className={`animate-spin text-brand ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z" />
    </svg>
  )
}

function StatusBadge({ status, className = '' }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.needs_attention
  return (
    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${cfg.badge} ${className}`}>
      {cfg.label}
    </span>
  )
}

function Card({ title, badge, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {title && (
        <div className="bg-black px-5 py-3.5 flex items-center justify-between">
          <h2 className="font-bold text-white uppercase tracking-wide text-sm">{title}</h2>
          {badge}
        </div>
      )}
      {children}
    </div>
  )
}

// ── Main page content ─────────────────────────────────────────────────────────

function EligibilityContent() {
  const { session } = useAuth()

  // Phase: idle | uploading | extracting | confirming | processing | picking_school | results
  const [phase, setPhase]             = useState('idle')
  const [uploadedPath, setUploadedPath] = useState(null)
  const [extractedSchool, setExtractedSchool] = useState({ name: '', state: '' })
  const [extractedCeebCode, setExtractedCeebCode] = useState(null)
  const [editSchool, setEditSchool]   = useState({ name: '', state: '' })
  const [editingSchool, setEditingSchool] = useState(false)
  const [schools, setSchools]         = useState([])   // multiple NCAA matches
  const [result, setResult]           = useState(null)
  const [athleteId, setAthleteId]     = useState(null)
  const [history, setHistory]         = useState([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError]             = useState(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [dragging, setDragging]       = useState(false)
  const [courseFilter, setCourseFilter] = useState('all')

  const fileInputRef = useRef(null)

  // ── Load athlete + history ──────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: athlete } = await supabase
        .from('student_athletes')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()
      if (!athlete) { setLoadingHistory(false); return }
      setAthleteId(athlete.id)

      const { data } = await supabase
        .from('eligibility_assessments')
        .select('id, assessment_date, high_school_name, high_school_state, overall_status, core_course_gpa, total_core_credits, created_at')
        .eq('athlete_id', athlete.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setHistory(data ?? [])
      setLoadingHistory(false)
    }
    load()
  }, [session.user.id])

  // ── Rotate progress messages ────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'extracting' && phase !== 'processing') return
    const msgs = phase === 'extracting'
      ? ['Reading your transcript…', 'Identifying your high school…']
      : [
          `Looking up NCAA-approved courses for ${extractedSchool.name || 'your school'}…`,
          'Mapping your courses against the approved list…',
          'Calculating core-course GPA…',
          'Checking Division I and II requirements…',
          'Saving your assessment…',
        ]
    let i = 0
    setProgressMsg(msgs[0])
    const id = setInterval(() => { i = (i + 1) % msgs.length; setProgressMsg(msgs[i]) }, 3000)
    return () => clearInterval(id)
  }, [phase, extractedSchool.name])

  // ── File handling ───────────────────────────────────────────────────────

  function validateFile(f) {
    if (!ACCEPTED_TYPES.includes(f.type)) return 'Please upload a JPEG, PNG, or PDF file.'
    if (f.size > MAX_BYTES) return 'File must be 10 MB or smaller.'
    return null
  }

  function handleFile(f) {
    const err = validateFile(f)
    if (err) { setError(err); return }
    setError(null)
    uploadFile(f)
  }

  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true) }, [])
  const onDragLeave = useCallback(() => setDragging(false), [])
  const onDrop      = useCallback(e => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step 1: Upload ──────────────────────────────────────────────────────

  async function uploadFile(f) {
    setPhase('uploading')
    const ext  = f.name.split('.').pop().toLowerCase()
    const path = `${session.user.id}/${Date.now()}_transcript.${ext}`
    const { error: upErr } = await supabase.storage
      .from('transcripts')
      .upload(path, f, { contentType: f.type })
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setPhase('idle'); return }
    setUploadedPath(path)
    await doExtractSchool(path)
  }

  // ── Step 2: Extract school (Pass 1 only) ───────────────────────────────

  async function doExtractSchool(path) {
    setPhase('extracting')
    try {
      const res  = await callFn({ athlete_id: athleteId, storage_path: path, storage_bucket: 'transcripts', extract_only: true })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.status !== 'school_extracted') throw new Error('Unexpected response')
      const school = { name: data.high_school_name, state: data.high_school_state }
      setExtractedSchool(school)
      setEditSchool(school)
      setExtractedCeebCode(data.ceeb_code ?? null)
      setPhase('confirming')
    } catch (e) {
      setError(`Could not read transcript: ${e.message}`)
      setPhase('idle')
    }
  }

  // ── Step 3: Full analysis ───────────────────────────────────────────────

  async function doAnalysis(schoolName, schoolState, ncaaCode = null) {
    setPhase('processing')
    setError(null)
    try {
      const body = {
        athlete_id:     athleteId,
        storage_path:   uploadedPath,
        storage_bucket: 'transcripts',
        school_name:    schoolName,
        school_state:   schoolState,
      }
      if (ncaaCode)          body.ncaa_school_code = ncaaCode
      if (extractedCeebCode) body.ceeb_code = extractedCeebCode

      const res  = await callFn(body)
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      if (data.status === 'needs_school_selection') {
        setSchools(data.schools)
        setPhase('picking_school')
      } else if (data.status === 'found') {
        setResult(data)
        setCourseFilter('all')
        setPhase('results')
        refreshHistory()
      } else {
        throw new Error('Unexpected response')
      }
    } catch (e) {
      setError(`Analysis failed: ${e.message}`)
      setPhase('idle')
    }
  }

  async function refreshHistory() {
    if (!athleteId) return
    const { data } = await supabase
      .from('eligibility_assessments')
      .select('id, assessment_date, high_school_name, high_school_state, overall_status, core_course_gpa, total_core_credits, created_at')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistory(data ?? [])
  }

  function callFn(body) {
    return fetch(`${SUPABASE_URL}/functions/v1/process-transcript`, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
  }

  function reset() {
    setPhase('idle'); setUploadedPath(null); setExtractedSchool({ name: '', state: '' })
    setEditSchool({ name: '', state: '' }); setEditingSchool(false); setSchools([])
    setResult(null); setError(null); setExtractedCeebCode(null)
  }

  // ── Derived result values ───────────────────────────────────────────────

  const approvedCourses = result?.courses.filter(c => c.is_approved) ?? []
  const totalQP         = approvedCourses.reduce((s, c) => s + c.quality_points, 0)

  const pre7th = approvedCourses.filter(c => {
    if (!c.semester) return false
    const s = c.semester.toLowerCase()
    return s.includes('9th') || s.includes('10th') ||
      (s.includes('11th') && (s.includes('fall') || s.includes('first')))
  })
  const pre7thEMSCount = pre7th.filter(c =>
    c.mapped_category === 'English' ||
    c.mapped_category === 'Mathematics' ||
    c.mapped_category === 'Natural/Physical Science',
  ).length

  const filteredCourses = result?.courses.filter(c => {
    if (courseFilter === 'approved')     return c.is_approved
    if (courseFilter === 'not_approved') return !c.is_approved && c.mapped_category !== 'Non-Core'
    if (courseFilter === 'review')       return c.needs_review
    return true
  }) ?? []

  // ── Recommendations ─────────────────────────────────────────────────────

  function buildRecs() {
    if (!result) return []
    const { di } = result
    const recs = []
    const gap = (have, need, label) => {
      if (have < need) recs.push(`You still need ${need - have} more ${label} course${need - have > 1 ? 's' : ''} to meet the DI minimum of ${need}.`)
    }
    gap(di.english_count, 4, 'English')
    gap(di.math_count, 3, 'Math')
    gap(di.science_count, 2, 'Science')
    gap(di.social_science_count, 2, 'Social Science')
    if (di.core_courses < 16) recs.push(`You need ${16 - di.core_courses} more approved core courses to reach the required 16.`)
    if (!di.meets_10_7_rule) {
      const need10 = Math.max(0, 10 - pre7th.length)
      const need7  = Math.max(0, 7 - pre7thEMSCount)
      if (need10 > 0) recs.push(`10/7 Rule: you need ${need10} more core course${need10 > 1 ? 's' : ''} completed before your 7th semester.`)
      if (need7  > 0) recs.push(`10/7 Rule: ${need7} of those pre-7th-semester courses must be in English, Math, or Science.`)
    }
    if (result.core_course_gpa < 2.3) recs.push(`Your core-course GPA (${result.core_course_gpa.toFixed(3)}) is below the DI sliding-scale minimum of 2.300.`)
    const reviewCount = result.courses.filter(c => c.needs_review && c.is_approved).length
    if (reviewCount > 0) recs.push(`${reviewCount} approved course${reviewCount > 1 ? 's are' : ' is'} flagged for review — confirm these match your school's approved list.`)
    if (!result.approved_list_available) recs.push("No NCAA-approved course list was found for your school. All courses show as \"Not Approved\" — contact the NCAA Eligibility Center to verify your school's list.")
    return recs
  }

  const recs = buildRecs()

  // ── Render ────────────────────────────────────────────────────────────────

  const showHistory = !['uploading', 'extracting', 'processing'].includes(phase)

  return (
    <div className="min-h-screen bg-gray-100">
      <Nav />

      {/* Page header */}
      <div className="bg-black px-4 sm:px-6 py-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white uppercase tracking-wide">NCAA Eligibility Checker</h1>
            <p className="text-white/50 text-sm mt-0.5">Upload your transcript to check DI and DII core-course eligibility</p>
          </div>
          {phase === 'results' && (
            <button
              onClick={reset}
              className="flex-shrink-0 text-xs font-bold bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl transition-colors uppercase tracking-wide"
            >
              New Check
            </button>
          )}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            {error}
          </div>
        )}

        {/* ── Upload card ───────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <Card title="Upload Transcript">
            <div className="p-5 space-y-4">

              {/* Disclaimer */}
              <div className="flex gap-3 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-yellow-800 leading-relaxed">
                  <strong>Estimate only.</strong> This tool provides an unofficial estimate based on your transcript.
                  The NCAA Eligibility Center makes the official determination after graduation.
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors
                  ${dragging ? 'border-brand bg-yellow-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,application/pdf"
                  onChange={e => { const f = e.target.files[0]; if (f) handleFile(f) }}
                  className="hidden"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-black">
                      {dragging ? 'Drop to upload' : 'Drag & drop your transcript here'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse · JPEG, PNG, PDF · Max 10 MB</p>
                  </div>
                </div>
              </div>

              {!athleteId && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  You need to complete your <a href="/profile" className="font-bold underline">profile</a> before checking eligibility.
                </p>
              )}
            </div>
          </Card>
        )}

        {/* ── Processing / extracting card ──────────────────────────────── */}
        {(phase === 'uploading' || phase === 'extracting' || phase === 'processing') && (
          <Card title={phase === 'uploading' ? 'Uploading…' : phase === 'extracting' ? 'Reading Transcript…' : 'Analyzing…'}>
            <div className="px-5 py-12 flex flex-col items-center gap-5 text-center">
              <Spinner className="w-10 h-10" />
              <div>
                <p className="text-sm font-semibold text-black">{progressMsg || 'Please wait…'}</p>
                <p className="text-xs text-gray-400 mt-1">This can take 15–30 seconds</p>
              </div>
              {/* Steps */}
              <div className="flex gap-2 mt-2">
                {['Upload', 'Identify School', 'Analyze'].map((step, i) => {
                  const done  = (phase === 'extracting' && i === 0) || (phase === 'processing' && i <= 1)
                  const active = (phase === 'uploading' && i === 0) || (phase === 'extracting' && i === 1) || (phase === 'processing' && i === 2)
                  return (
                    <div key={step} className="flex items-center gap-2">
                      {i > 0 && <div className={`w-6 h-px ${done ? 'bg-brand' : 'bg-gray-200'}`} />}
                      <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                        done   ? 'bg-brand text-black' :
                        active ? 'bg-black text-white' :
                                 'bg-gray-100 text-gray-400'
                      }`}>
                        {done && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {step}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        )}

        {/* ── School confirmation ───────────────────────────────────────── */}
        {phase === 'confirming' && (
          <Card title="Confirm Your School">
            <div className="p-5 space-y-5">
              <p className="text-sm text-gray-600">
                We identified the following school from your transcript. Please confirm it's correct before we look up the NCAA-approved course list.
              </p>

              {!editingSchool ? (
                <div className="flex items-start justify-between gap-4 bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div>
                    <p className="font-bold text-black text-lg leading-snug">{extractedSchool.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{extractedSchool.state}</p>
                  </div>
                  <button
                    onClick={() => setEditingSchool(true)}
                    className="text-xs text-gray-400 hover:text-gray-700 underline underline-offset-2 flex-shrink-0 mt-1"
                  >
                    Not right?
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">School Name</label>
                    <input
                      type="text"
                      value={editSchool.name}
                      onChange={e => setEditSchool(s => ({ ...s, name: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition"
                      placeholder="e.g. Manasquan High School"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">State (2-letter code)</label>
                    <input
                      type="text"
                      value={editSchool.state}
                      onChange={e => setEditSchool(s => ({ ...s, state: e.target.value.toUpperCase().slice(0, 2) }))}
                      maxLength={2}
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-black bg-white focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition uppercase"
                      placeholder="NJ"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    const s = editingSchool ? editSchool : extractedSchool
                    setExtractedSchool(s)
                    doAnalysis(s.name, s.state)
                  }}
                  disabled={!editSchool.name || !editSchool.state}
                  className="flex-1 bg-brand hover:bg-brand-dark disabled:opacity-50 text-black text-sm font-bold py-2.5 rounded-xl transition-colors uppercase tracking-wide"
                >
                  Yes, look up this school →
                </button>
                <button
                  onClick={reset}
                  className="px-4 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* ── Multiple school matches ───────────────────────────────────── */}
        {phase === 'picking_school' && (
          <Card title="Select Your School">
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Multiple schools matched <strong>"{extractedSchool.name}"</strong> in the NCAA portal. Select the one that matches your transcript.
              </p>
              <div className="space-y-2">
                {schools.map(s => (
                  <button
                    key={s.ncaa_school_code}
                    onClick={() => doAnalysis(s.name, s.state, s.ncaa_school_code)}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-50 hover:bg-brand/10 border border-gray-200 hover:border-brand rounded-xl transition-colors text-left"
                  >
                    <div>
                      <p className="font-semibold text-black text-sm">{s.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.city}, {s.state}</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </div>
              <button onClick={reset} className="text-sm text-gray-400 hover:text-gray-700 underline underline-offset-2">
                Cancel and start over
              </button>
            </div>
          </Card>
        )}

        {/* ── Results dashboard ─────────────────────────────────────────── */}
        {phase === 'results' && result && (() => {
          const { di, dii, core_course_gpa, total_core_credits, overall_status } = result
          const diCfg  = STATUS_CFG[di.status === 'at_risk_10_7_rule' ? 'at_risk' : di.eligible ? 'on_track' : 'needs_attention']
          const diiCfg = STATUS_CFG[dii.eligible ? 'on_track' : 'needs_attention']

          return (
            <>
              {/* Overall status banner */}
              <div className={`rounded-2xl px-5 py-4 flex items-center justify-between ${STATUS_CFG[overall_status]?.banner ?? 'bg-gray-500 text-white'}`}>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80">Overall Eligibility Status</p>
                  <p className="text-2xl font-bold mt-0.5">{STATUS_CFG[overall_status]?.label}</p>
                  <p className="text-sm opacity-75 mt-0.5">{result.high_school_name} · {result.high_school_state}</p>
                </div>
                <svg className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  {overall_status === 'on_track'
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    : overall_status === 'at_risk'
                    ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  }
                </svg>
              </div>

              {/* Disclaimer */}
              <div className="flex gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-yellow-800">
                  <strong>Estimate only.</strong> This tool provides an unofficial estimate. The NCAA Eligibility Center makes the official determination after graduation.
                </p>
              </div>

              {/* DI / DII cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Division I', cfg: diCfg, data: di, note: di.status === 'at_risk_10_7_rule' ? '10/7 Rule not yet met' : null },
                  { label: 'Division II', cfg: diiCfg, data: dii, note: null },
                ].map(({ label, cfg, data, note }) => (
                  <div key={label} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="bg-black px-5 py-3 flex items-center justify-between">
                      <span className="font-bold text-white uppercase tracking-wide text-sm">{label}</span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Core Courses</span>
                        <span className="font-bold text-black">{data.core_courses} <span className="text-gray-400 font-normal text-xs">/ 16 required</span></span>
                      </div>
                      {[
                        { cat: 'English',  have: data.english_count,        need: label === 'Division I' ? 4 : 3 },
                        { cat: 'Math',     have: data.math_count,           need: label === 'Division I' ? 3 : 2 },
                        { cat: 'Science',  have: data.science_count,        need: 2 },
                        { cat: 'Social Sc.', have: data.social_science_count, need: 2 },
                      ].map(({ cat, have, need }) => (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-500">{cat}</span>
                            <span className={`font-semibold ${have >= need ? 'text-green-600' : 'text-red-600'}`}>{have}/{need}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full transition-all ${have >= need ? 'bg-green-400' : 'bg-red-400'}`}
                              style={{ width: `${Math.min(have / need * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {note && <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5 mt-1">{note}</p>}
                    </div>
                  </div>
                ))}
              </div>

              {/* GPA + 10/7 rule */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* GPA card */}
                <Card title="Core-Course GPA">
                  <div className="p-5 space-y-3">
                    <div className="text-center py-2">
                      <p className={`text-5xl font-bold ${core_course_gpa >= 2.3 ? 'text-black' : 'text-red-500'}`}>
                        {core_course_gpa.toFixed(3)}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">DI minimum: 2.300 · DII minimum: 2.200</p>
                    </div>
                    <div className="border-t border-gray-100 pt-3 space-y-1.5 text-xs text-gray-500">
                      <div className="flex justify-between">
                        <span>Total quality points</span>
                        <span className="font-semibold text-black">{totalQP.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total core credits</span>
                        <span className="font-semibold text-black">{total_core_credits.toFixed(1)}</span>
                      </div>
                      <div className="flex justify-between border-t border-gray-100 pt-1.5">
                        <span className="font-semibold">GPA = {totalQP.toFixed(2)} ÷ {total_core_credits.toFixed(1)}</span>
                        <span className="font-bold text-black">{core_course_gpa.toFixed(3)}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      Only completed approved courses count. In-progress courses contribute 0 quality points until final grades post.
                    </p>
                  </div>
                </Card>

                {/* 10/7 rule card (DI) */}
                <Card title="DI — 10/7 Rule">
                  <div className="p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${di.meets_10_7_rule ? 'bg-green-100' : 'bg-yellow-100'}`}>
                        {di.meets_10_7_rule
                          ? <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          : <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" /></svg>
                        }
                      </div>
                      <div>
                        <p className={`font-bold text-sm ${di.meets_10_7_rule ? 'text-green-700' : 'text-yellow-700'}`}>
                          {di.meets_10_7_rule ? 'Requirement Met' : 'Not Yet Met'}
                        </p>
                        <p className="text-xs text-gray-500">Before the start of 7th semester</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>Core courses before 7th semester</span>
                        <span className={`font-bold ${pre7th.length >= 10 ? 'text-green-600' : 'text-red-600'}`}>{pre7th.length} / 10</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Of those in English, Math, or Science</span>
                        <span className={`font-bold ${pre7thEMSCount >= 7 ? 'text-green-600' : 'text-red-600'}`}>{pre7thEMSCount} / 7</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed">
                      DI athletes must complete 10 of 16 core courses before 7th semester, with 7 in English, Math, or Science.
                    </p>
                  </div>
                </Card>
              </div>

              {/* Category checklist */}
              <Card title="Core-Course Progress by Subject">
                <div className="divide-y divide-gray-50">
                  {[
                    { cat: 'English',                   di: 4, dii: 3, have: di.english_count },
                    { cat: 'Mathematics',               di: 3, dii: 2, have: di.math_count },
                    { cat: 'Natural/Physical Science',  di: 2, dii: 2, have: di.science_count },
                    { cat: 'Social Science',            di: 2, dii: 2, have: di.social_science_count },
                    { cat: 'Additional Core',           di: 5, dii: 7, have: di.additional_count, note: 'Includes Foreign Language and extra E/M/S courses' },
                  ].map(({ cat, di: diNeed, dii: diiNeed, have, note }) => (
                    <div key={cat} className="px-5 py-3.5 flex items-center gap-4">
                      <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${CAT_DOT[cat] ?? 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-black truncate">{cat}</p>
                          <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                            <span className="text-gray-400">DI: <span className={`font-bold ${have >= diNeed ? 'text-green-600' : 'text-red-600'}`}>{have}/{diNeed}</span></span>
                            <span className="text-gray-400">DII: <span className={`font-bold ${have >= diiNeed ? 'text-green-600' : 'text-red-600'}`}>{have}/{diiNeed}</span></span>
                          </div>
                        </div>
                        {note && <p className="text-[10px] text-gray-400 mt-0.5">{note}</p>}
                        <div className="mt-1.5 w-full bg-gray-100 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full transition-all ${have >= diNeed ? 'bg-green-400' : have >= Math.round(diNeed * 0.5) ? 'bg-yellow-400' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(have / diNeed * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Recommendations */}
              {recs.length > 0 && (
                <Card title="Recommendations">
                  <div className="divide-y divide-gray-50">
                    {recs.map((rec, i) => (
                      <div key={i} className="flex gap-3 px-5 py-3.5">
                        <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-sm text-gray-700">{rec}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Course breakdown table */}
              <Card
                title="Course Breakdown"
                badge={
                  <span className="text-xs text-white/50">{result.courses.length} courses</span>
                }
              >
                {/* Filter tabs */}
                <div className="border-b border-gray-100 px-5 py-2 flex gap-1 overflow-x-auto">
                  {[
                    { key: 'all',          label: `All (${result.courses.length})` },
                    { key: 'approved',     label: `Approved (${approvedCourses.length})` },
                    { key: 'not_approved', label: `Not Approved (${result.courses.filter(c => !c.is_approved && c.mapped_category !== 'Non-Core').length})` },
                    { key: 'review',       label: `Needs Review (${result.courses.filter(c => c.needs_review).length})` },
                  ].map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setCourseFilter(tab.key)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                        courseFilter === tab.key
                          ? 'bg-black text-white'
                          : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-left">
                        <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Course</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap">Category</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Cr.</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">Grade</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide text-right">QP</th>
                        <th className="px-3 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide text-center">Flag</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredCourses.map((c, i) => (
                        <tr key={i} className={`hover:bg-gray-50 transition-colors ${c.needs_review ? 'bg-yellow-50/50' : ''}`}>
                          <td className="px-5 py-2.5">
                            <p className={`font-medium leading-tight ${c.is_approved ? 'text-black' : 'text-gray-400'}`}>
                              {c.course_name}
                            </p>
                            {c.semester && <p className="text-[10px] text-gray-400 mt-0.5">{c.semester}</p>}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              c.is_approved       ? 'bg-green-100 text-green-800' :
                              c.mapped_category === 'Non-Core' ? 'bg-gray-100 text-gray-500' :
                                                    'bg-red-100 text-red-700'
                            }`}>
                              {CAT_SHORT[c.mapped_category] ?? c.mapped_category}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{c.credit}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-black whitespace-nowrap">
                            {c.grade === 'In Progress' ? <span className="text-gray-400 font-normal text-xs">In Progress</span> : c.grade}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">
                            {c.is_approved && c.grade !== 'In Progress' ? c.quality_points.toFixed(2) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {c.needs_review && (
                              <span title="Needs review" className="inline-flex w-4 h-4 rounded-full bg-yellow-400 items-center justify-center text-[9px] font-bold text-black">!</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {filteredCourses.length === 0 && (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">No courses match this filter.</div>
                  )}
                </div>

                {/* Table footer: totals for approved filter */}
                {courseFilter === 'approved' && approvedCourses.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 flex items-center justify-between text-xs font-bold text-gray-700 uppercase tracking-wide">
                    <span>Totals</span>
                    <div className="flex gap-6">
                      <span>Credits: {total_core_credits.toFixed(1)}</span>
                      <span>Quality Pts: {totalQP.toFixed(2)}</span>
                      <span>GPA: {core_course_gpa.toFixed(3)}</span>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )
        })()}

        {/* ── History ───────────────────────────────────────────────────── */}
        {showHistory && history.length > 0 && (
          <Card
            title="Previous Assessments"
            badge={<span className="text-xs text-white/50">{history.length} total</span>}
          >
            {/* Mobile: card list */}
            <div className="sm:hidden divide-y divide-gray-50">
              {history.map(a => (
                <div key={a.id} className="px-5 py-3.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-black text-sm leading-tight">{a.high_school_name}</p>
                      <p className="text-xs text-gray-400">{a.high_school_state} · {new Date(a.assessment_date || a.created_at).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status={a.overall_status} />
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>GPA <strong className="text-black">{Number(a.core_course_gpa).toFixed(3)}</strong></span>
                    <span>Credits <strong className="text-black">{Number(a.total_core_credits).toFixed(1)}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-left">
                    <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">School</th>
                    <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">GPA</th>
                    <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Credits</th>
                    <th className="px-5 py-2.5 text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {history.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(a.assessment_date || a.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3 font-semibold text-black">
                        {a.high_school_name} <span className="text-gray-400 font-normal">({a.high_school_state})</span>
                      </td>
                      <td className="px-5 py-3 font-bold text-black whitespace-nowrap">{Number(a.core_course_gpa).toFixed(3)}</td>
                      <td className="px-5 py-3 text-gray-600 whitespace-nowrap">{Number(a.total_core_credits).toFixed(1)}</td>
                      <td className="px-5 py-3 whitespace-nowrap"><StatusBadge status={a.overall_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Empty history state in idle */}
        {phase === 'idle' && !loadingHistory && history.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-400">
            No previous assessments. Upload a transcript above to get started.
          </div>
        )}

      </main>
    </div>
  )
}

export default function Eligibility() {
  return (
    <ProtectedRoute>
      <EligibilityContent />
    </ProtectedRoute>
  )
}
