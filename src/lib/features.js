// Feature flags — baked in at build time by Vite.
// ENABLE_BUDGETING is intentionally unused right now: the funding-request
// system (student_athletes, funding_requests tables, Dashboard/NewRequest/
// Profile pages, StudentRoute) is kept dormant-but-restorable rather than
// deleted, so this flag documents that it's off by design, not gone.
export const ENABLE_BUDGETING = import.meta.env.VITE_ENABLE_BUDGETING === 'true'
