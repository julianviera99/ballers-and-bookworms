-- =============================================================================
-- 021_admin_fixes.sql
-- 1. Hard-code julianviera99@gmail.com as admin (safety net alongside
--    julian@ballersandbookworms.org which was set in migration 020).
-- 2. Add get_admin_user_list() — SECURITY DEFINER function that joins
--    profiles with auth.users so admins can see email + display name.
-- =============================================================================

-- ── 1. Backfill julianviera99@gmail.com as admin ─────────────────────────────

INSERT INTO public.profiles (id, role)
SELECT au.id, 'admin'::user_role
FROM auth.users au
WHERE au.email = 'julianviera99@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- ── 2. Admin user list function ───────────────────────────────────────────────
-- Returns all profiles joined with auth.users metadata.
-- SECURITY DEFINER so it can read auth.users; aborts if caller is not admin.

CREATE OR REPLACE FUNCTION public.get_admin_user_list()
RETURNS TABLE (
  id           uuid,
  role         user_role,
  school_id    text,
  created_at   timestamptz,
  email        text,
  display_name text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.role,
    p.school_id,
    p.created_at,
    au.email,
    COALESCE(
      NULLIF(au.raw_user_meta_data->>'full_name',  ''),
      NULLIF(au.raw_user_meta_data->>'name',       ''),
      NULLIF(au.raw_user_meta_data->>'user_name',  ''),
      au.email
    ) AS display_name
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

-- Only admins can call this (is_admin() check is inside the function body,
-- but also restrict at the grant level as a defense-in-depth measure).
REVOKE EXECUTE ON FUNCTION public.get_admin_user_list() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;
