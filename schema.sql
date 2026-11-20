-- =============================================================================
-- Time Task BD — profiles + auth trigger + RLS (run in Supabase SQL Editor)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── profiles table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role                TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER', 'BUYER')),
    full_name           TEXT,
    username            TEXT UNIQUE,
    email               TEXT,
    avatar_url          TEXT,
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified      BOOLEAN NOT NULL DEFAULT FALSE,
    onboarding_settings TEXT DEFAULT 'onprogress',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding ON public.profiles(onboarding_completed);

-- Safe column adds when upgrading an existing deployment
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_settings TEXT DEFAULT 'onprogress';

-- ─── updated_at helper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Normalize role from signup metadata ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_profile_role(raw_role TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF raw_role IS NULL THEN
        RETURN 'USER';
    END IF;

    CASE UPPER(TRIM(raw_role))
        WHEN 'BUYER' THEN RETURN 'BUYER';
        WHEN 'USER'  THEN RETURN 'USER';
        ELSE RETURN 'USER';
    END CASE;
END;
$$;

-- ─── Auto-create profile on auth.users insert ────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    meta JSONB := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
    resolved_role TEXT;
    resolved_username TEXT;
BEGIN
    resolved_role := public.normalize_profile_role(meta->>'role');
    resolved_username := NULLIF(TRIM(meta->>'username'), '');

    INSERT INTO public.profiles (
        id,
        role,
        full_name,
        username,
        email,
        avatar_url,
        onboarding_completed,
        email_verified,
        onboarding_settings
    )
    VALUES (
        NEW.id,
        resolved_role,
        NULLIF(TRIM(meta->>'full_name'), ''),
        resolved_username,
        NEW.email,
        NULLIF(TRIM(meta->>'avatar_url'), ''),
        FALSE,
        COALESCE(NEW.email_confirmed_at IS NOT NULL, FALSE),
        COALESCE(NULLIF(TRIM(meta->>'onboarding_settings'), ''), 'onprogress')
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name   = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        username    = COALESCE(EXCLUDED.username, public.profiles.username),
        email       = COALESCE(EXCLUDED.email, public.profiles.email),
        avatar_url  = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        updated_at  = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ─── Sync email_verified when auth.users email is confirmed ──────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL
       AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at) THEN
        UPDATE public.profiles
        SET email_verified = TRUE,
            updated_at = NOW()
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_email_verified();

-- ─── Prevent role tampering after onboarding ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        -- Allow one-time role correction before onboarding is completed
        IF OLD.onboarding_completed = TRUE THEN
            RAISE EXCEPTION 'Role cannot be changed after onboarding is completed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_role_change ON public.profiles;
CREATE TRIGGER prevent_profile_role_change
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_profile_role_change();

-- ─── Username availability (safe public check) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_username_taken(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE LOWER(username) = LOWER(TRIM(p_username))
    );
$$;

REVOKE ALL ON FUNCTION public.is_username_taken(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_username_taken(TEXT) TO anon, authenticated;

-- ─── Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);
