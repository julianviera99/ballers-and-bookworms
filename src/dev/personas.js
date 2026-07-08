// Dev-only seed personas. Never imported in production (DevSwitcher is only rendered
// under import.meta.env.DEV, which Vite strips from production builds).

export const DEV_PERSONAS = [
  // ── Admins ────────────────────────────────────────────────────────────────
  {
    id:          'dev-admin-1',
    email:       'dev.admin1@bandb.test',
    password:    'devpass123',
    displayName: 'Jordan Rivera',
    role:        'admin',
  },
  {
    id:          'dev-admin-2',
    email:       'dev.admin2@bandb.test',
    password:    'devpass123',
    displayName: 'Morgan Torres',
    role:        'admin',
  },

  // ── School Staff ──────────────────────────────────────────────────────────
  // Each staff persona is scoped to a specific school via profiles.school_id.
  // The matching student persona has school_ceeb_code set to the same value,
  // so the "School staff can select own school athletes" RLS policy applies.
  {
    id:          'dev-staff-1',
    email:       'dev.staff.nj@bandb.test',
    password:    'devpass123',
    displayName: 'Coach Patterson',
    role:        'school_staff',
    schoolId:    '310158',
    schoolName:  'Burlington Township High School',
    schoolState: 'NJ',
  },
  {
    id:          'dev-staff-2',
    email:       'dev.staff.ca@bandb.test',
    password:    'devpass123',
    displayName: 'Coach Nguyen',
    role:        'school_staff',
    schoolId:    '050999',
    schoolName:  'Riverside High School',
    schoolState: 'CA',
  },

  // ── Students ──────────────────────────────────────────────────────────────
  // Marcus is at Burlington Township → visible to Coach Patterson only.
  // Destiny is at Riverside High → visible to Coach Nguyen only.
  {
    id:             'dev-athlete-1',
    email:          'dev.marcus@bandb.test',
    password:       'devpass123',
    displayName:    'Marcus Johnson',
    role:           'student',
    school:         'Burlington Township High School',
    schoolCeebCode: '310158',
    grade:          'Sophomore',
    sports:         ['Basketball', 'Track'],
    hometown:       'Burlington',
    homeState:      'NJ',
    requests: [
      {
        category:    'athletic_equipment',
        amount:      149.99,
        description: 'New basketball shoes for the upcoming season. My current pair has worn through the sole and I have tryouts in two weeks.',
        status:      'approved',
        staff_note:  'Approved — reasonable equipment need.',
        created_at:  '2026-01-15T10:00:00Z',
      },
      {
        category:    'academic_supplies',
        amount:      89.00,
        description: 'TI-84 Plus graphing calculator required for AP Calculus and AP Statistics.',
        status:      'reimbursed',
        staff_note:  null,
        created_at:  '2026-01-28T14:30:00Z',
      },
      {
        category:    'tutoring',
        amount:      200.00,
        description: 'SAT prep tutoring — 4 sessions at $50 each with a certified tutor through Kaplan.',
        status:      'pending',
        staff_note:  null,
        created_at:  '2026-03-01T09:15:00Z',
      },
      {
        category:    'travel_costs',
        amount:      350.00,
        description: 'AAU regional tournament in Charlotte — bus fare and hotel split with 2 teammates.',
        status:      'denied',
        staff_note:  'Travel for this tournament is already covered through the school program. Resubmit for any out-of-pocket costs not covered.',
        created_at:  '2026-02-10T11:45:00Z',
      },
    ],
  },

  {
    id:             'dev-athlete-2',
    email:          'dev.destiny@bandb.test',
    password:       'devpass123',
    displayName:    'Destiny Williams',
    role:           'student',
    school:         'Riverside High School',
    schoolCeebCode: '050999',
    grade:          'Junior',
    sports:         ['Soccer', 'Volleyball'],
    hometown:       'Riverside',
    homeState:      'CA',
    requests: [
      {
        category:    'nutrition_consulting',
        amount:      120.00,
        description: 'Two sessions with a sports nutritionist to build a meal plan for dual-sport training load.',
        status:      'approved',
        staff_note:  'Great initiative. Approved.',
        created_at:  '2026-02-03T08:00:00Z',
      },
      {
        category:    'camp_fees',
        amount:      450.00,
        description: 'Elite Soccer Skills Camp at UC Riverside, July 14–18. Includes a college recruiting showcase on day 3.',
        status:      'flagged',
        staff_note:  'Need a registration link or brochure to verify the camp before approving this amount.',
        created_at:  '2026-03-12T13:00:00Z',
      },
      {
        category:    'academic_supplies',
        amount:      45.00,
        description: 'AP US History review books and a Quizlet Plus subscription for finals prep.',
        status:      'pending',
        staff_note:  null,
        created_at:  '2026-04-01T10:30:00Z',
      },
    ],
  },
]
