import { Link } from 'react-router-dom'

const SUPABASE_URL = 'https://nlmgqsjrqqjsttmdfcey.supabase.co'
const PUBLIC = `${SUPABASE_URL}/storage/v1/object/public/demo-transcripts`

const PERSONAS = [
  {
    name:    'Marcus Johnson',
    role:    'Student Athlete',
    email:   'dev.marcus@bandb.test',
    detail:  'Sophomore basketball/track player with a mix of approved, pending, denied, and reimbursed requests — best for exploring the full fund request lifecycle.',
  },
  {
    name:    'Destiny Williams',
    role:    'Student Athlete',
    email:   'dev.destiny@bandb.test',
    detail:  'Junior soccer/volleyball player with a flagged request and an in-progress pending request — good for showing the flagging and follow-up flow.',
  },
  {
    name:    'Tyler Chen',
    role:    'Student Athlete',
    email:   'dev.tyler@bandb.test',
    detail:  'Senior swimmer with one pending request — a clean slate for submitting a new request from scratch and testing the eligibility checker.',
  },
  {
    name:    'Coach Rivera',
    role:    'Staff',
    email:   'dev.coach@bandb.test',
    detail:  'Staff account with access to the full staff dashboard, athlete roster, request approval queue, and mentor management tools.',
  },
  {
    name:    'Admin Torres',
    role:    'Staff',
    email:   'dev.admin@bandb.test',
    detail:  'Second staff account — useful for demonstrating that multiple staff members see the same shared queue.',
  },
]

const TRANSCRIPTS = [
  {
    label:    'JPEG Transcript 1 — Manasquan High School (NJ)',
    file:     'JPEG%20Transcript%201.jpeg',
    desc:     'On Track — meets both DI and DII eligibility requirements. Anonymized. Letter grades with Honors and AP courses across all four years.',
  },
  {
    label:    'JPEG Transcript 2 — Brick Memorial High School (NJ)',
    file:     'JPEG%20Transcript%202.jpeg',
    desc:     'Needs Attention — does not currently meet DI or DII requirements. Anonymized. Numeric grades (100-point scale) with in-progress senior year courses excluded from GPA.',
  },
  {
    label:    'PDF Transcript — Burlington Township High School (NJ)',
    file:     'PDF%20Transcript%201.pdf',
    desc:     'On Track — meets both DI and DII eligibility requirements. Anonymized. PDF format with the school\'s own grade scale legend printed on the transcript.',
  },
]

const GUIDES = [
  {
    title: 'Student Athlete Budgeting Tool',
    subtitle: 'Log in as any athlete persona',
    steps: [
      'Click the yellow DEV button in the bottom-right corner and select Marcus Johnson (or any athlete).',
      'You land on the Dashboard — it shows your $1,000 annual budget, how much is remaining, and every past request with its current status.',
      'Click "New Request" in the top navigation to submit a new funding request.',
      'Choose a category (academic supplies, athletic equipment, travel, etc.), enter an amount, and describe the need in detail.',
      'Hit Submit — your new request appears on the Dashboard immediately as Pending.',
      'Marcus already has approved, denied, flagged, and reimbursed requests loaded — explore those to see the full lifecycle without waiting for staff action.',
    ],
  },
  {
    title: 'Staff Dashboard & Request Approval',
    subtitle: 'Log in as Coach Rivera or Admin Torres',
    steps: [
      'Click the DEV button and select Coach Rivera or Admin Torres.',
      'You land on the Staff Dashboard showing every pending request across all athletes, sorted by submission date.',
      'Click any request card to open the detail view — it shows the athlete\'s name, category, amount, description, and their remaining budget.',
      'Choose Approve, Deny, or Flag. Optionally add a staff note explaining your decision.',
      'The status updates immediately — switch to an athlete account via the DEV button to see the decision reflected on their Dashboard.',
      'Use "All Athletes" in the navigation to browse individual athlete profiles and their full request history.',
    ],
  },
  {
    title: 'Mentor Matching',
    subtitle: 'Log in as any athlete persona',
    steps: [
      'Click the DEV button and select any athlete.',
      'Click "Find a Mentor" in the navigation.',
      'In the text box, describe what you\'re looking for — be specific: your sport, academic struggles, career interests, or the kind of support you need.',
      'Hit Search. The AI extracts your needs, filters the mentor pool, and runs a vector similarity search to rank the best matches.',
      'Review the ranked mentor cards — each includes a personalized explanation of why that mentor was matched to you.',
      'Click "Request Session" on any mentor card to send them a session request.',
    ],
  },
  {
    title: 'NCAA Eligibility Checker',
    subtitle: 'Log in as any athlete persona',
    steps: [
      'Download one of the sample transcripts above using the links in the Sample Transcripts section.',
      'Click the DEV button and log in as any athlete.',
      'Click "NCAA Eligibility" in the navigation.',
      'Click "Upload Transcript" and select the transcript file you downloaded.',
      'The AI reads the transcript and extracts the school name and state. Confirm the school or correct it if needed.',
      'If multiple schools match the name, you\'ll be prompted to pick the right one from the NCAA portal results.',
      'Review the full eligibility report: overall status (On Track / At Risk / Needs Attention), core course GPA, DI and DII breakdowns, course-by-course approval status, and the 10/7 rule check.',
    ],
  },
]

export default function Demo() {
  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* Top bar */}
      <div className="bg-black px-6 py-4 flex items-center justify-between">
        <Link to="/">
          <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-8 w-auto" />
        </Link>
        <span className="text-xs font-bold text-brand uppercase tracking-widest">Professor Demo</span>
      </div>

      {/* Hero */}
      <div className="bg-black px-4 py-14 text-center">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="inline-block bg-brand text-black text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-2">
            Demo Guide
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
            Ballers &amp; Bookworms
          </h1>
          <p className="text-white/60 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
            A private web app that helps student athletes request financial support, connect with mentors,
            and check their NCAA eligibility — all in one place. This guide walks you through every feature
            using pre-loaded test data so you can explore without creating an account.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full px-4 py-12 space-y-14">

        {/* How to Log In */}
        <section className="space-y-4">
          <SectionHeader number="1" title="How to Log In" />
          <div className="bg-brand/10 border border-brand/30 rounded-2xl p-6 space-y-3">
            <p className="text-sm text-gray-800 leading-relaxed">
              You do <strong>not</strong> need to create an account or connect GitHub to explore the app.
              Instead, look for the floating <strong className="font-bold">black and yellow "DEV" button</strong> in
              the bottom-right corner of any page after you click into the app. Click it to instantly
              switch between any of the five test personas below — athletes and staff — with a fully
              authenticated session and real data.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              You can switch personas at any time, from any page, without logging out first.
            </p>
          </div>
        </section>

        {/* Test Accounts */}
        <section className="space-y-4">
          <SectionHeader number="2" title="Test Accounts" />
          <div className="space-y-3">
            {PERSONAS.map(p => (
              <div key={p.email} className="flex gap-4 items-start border border-gray-200 rounded-xl p-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  p.role === 'Staff' ? 'bg-blue-500 text-white' : 'bg-brand text-black'
                }`}>
                  {p.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-sm text-black">{p.name}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      p.role === 'Staff'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-brand/20 text-yellow-800'
                    }`}>{p.role}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{p.email}</p>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sample Transcripts */}
        <section className="space-y-4">
          <SectionHeader number="3" title="Sample Transcripts" />
          <p className="text-sm text-gray-600">
            Download any of these to test the NCAA Eligibility Checker. Each demonstrates a different
            scenario.
          </p>
          <div className="space-y-3">
            {TRANSCRIPTS.map(t => (
              <div key={t.file} className="border border-gray-200 rounded-xl p-4 flex items-start gap-4">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <a
                    href={`${PUBLIC}/${t.file}`}
                    download
                    className="text-sm font-semibold text-black hover:text-brand transition-colors underline underline-offset-2"
                  >
                    {t.label}
                  </a>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Feature Guides */}
        <section className="space-y-6">
          <SectionHeader number="4" title="Feature Guides" />
          <div className="space-y-8">
            {GUIDES.map((g, i) => (
              <div key={g.title} className="border border-gray-200 rounded-2xl overflow-hidden">
                <div className="bg-black px-6 py-4">
                  <h3 className="text-base font-black text-white uppercase tracking-wide">{g.title}</h3>
                  <p className="text-xs text-white/50 mt-0.5">{g.subtitle}</p>
                </div>
                <ol className="divide-y divide-gray-100">
                  {g.steps.map((step, si) => (
                    <li key={si} className="flex gap-4 px-6 py-4">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand text-black text-xs font-black flex items-center justify-center mt-0.5">
                        {si + 1}
                      </span>
                      <p className="text-sm text-gray-700 leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div className="text-center pt-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-black font-bold px-8 py-4 rounded-xl transition-colors text-sm uppercase tracking-wide"
          >
            Go to the App →
          </Link>
        </div>

      </div>

      {/* Footer */}
      <div className="bg-black mt-auto px-6 py-8 flex flex-col items-center gap-3">
        <img src="/brand/bandb_logo1.png" alt="Ballers and Bookworms" className="h-6 w-auto opacity-60" />
        <p className="text-white/40 text-xs">© {new Date().getFullYear()} Ballers and Bookworms. All rights reserved.</p>
      </div>

    </div>
  )
}

function SectionHeader({ number, title }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-7 h-7 rounded-full bg-black text-brand text-xs font-black flex items-center justify-center flex-shrink-0">
        {number}
      </span>
      <h2 className="text-lg font-black text-black uppercase tracking-wide">{title}</h2>
    </div>
  )
}
