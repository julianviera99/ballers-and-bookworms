// Feature flags — baked in at build time by Vite.
// To change what's visible, update the VITE_* vars in .env (local) or
// Cloudflare Pages environment variables (production) and rebuild.
export const ENABLE_BUDGETING   = import.meta.env.VITE_ENABLE_BUDGETING   === 'true'
export const ENABLE_MENTORSHIP  = import.meta.env.VITE_ENABLE_MENTORSHIP  === 'true'
export const ENABLE_ELIGIBILITY = import.meta.env.VITE_ENABLE_ELIGIBILITY === 'true'
