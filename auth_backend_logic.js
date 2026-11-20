import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// ─── Configuration ────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://kdoouzlmncekkozjrsdf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtkb291emxtbmNla2tvempyc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODY5MjIsImV4cCI6MjA4NjU2MjkyMn0.7lsbYQ594Ix8LSXLs6RHYfljiO2A5P70XAjPsqWo8bs';

// Initialize single ES module Supabase Client
export const supabase = (typeof window !== 'undefined' && window.supabaseClient)
    ? window.supabaseClient
    : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        }
    });

// Ensure global window instance matches
if (typeof window !== 'undefined' && !window.supabaseClient) {
    window.supabaseClient = supabase;
}

// ─── Path Routing Resolution ──────────────────────────────────────────────────
function getPath(folder, file) {
    if (typeof window === 'undefined') return file;
    const pathname = window.location.pathname.toLowerCase();
    const folderClean = folder.replace(/\/$/, '').toLowerCase();

    // Already in target folder
    if (pathname.includes(folderClean)) {
        return './' + file;
    }

    // In a different subfolder
    if (pathname.includes('dashboard') || pathname.includes('web dashboard') || pathname.includes('user dashboard') || pathname.includes('buyer dashboard')) {
        return '../' + folder + file;
    }

    // At root level
    return './' + folder + file;
}

const webDash = 'Web Dashboard/';
const userDash = 'User Dashboard/';
const buyerDash = 'Buyer Dashboard/';

export const PATH = {
    login:          getPath(webDash, 'Login_Page.html'),
    register:       getPath(webDash, 'Register_Page.html'),
    emailVerify:    getPath(webDash, 'Email Verifycation Page.html'),
    forgotPassword: getPath(webDash, 'Forgot Password Page.html'),
    newPasswordSet: getPath(webDash, 'New Password Set.html'),
    authCallback:   getPath(webDash, 'auth_callback.html'),
    userWelcome:    getPath(userDash, 'User Welcome Pop up.html'),
    buyerWelcome:   getPath(buyerDash, 'Buyer Welcome Pop up.html'),
    userGuideline:  getPath(userDash, 'User Guideline.html'),
    buyerGuideline: getPath(buyerDash, 'Buyer Guideline.html'),
    userDash:       getPath(userDash, 'User_Index.html'),
    buyerDash:      getPath(buyerDash, 'Buyer Index.html'),
};

// ─── Auth & Profile Operations ────────────────────────────────────────────────

export async function getSession() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
        console.error('[auth_backend_logic] getSession error:', error);
        return null;
    }
    return session;
}

export async function getProfile(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('[auth_backend_logic] getProfile error:', error);
        return null;
    }
    return data;
}

export async function checkUsernameAvailable(username) {
    if (!username) return false;
    try {
        const { data, error } = await supabase.rpc('check_username_available', {
            uname: username.trim().toLowerCase()
        });
        if (error) {
            console.warn('[auth_backend_logic] check_username_available RPC fallback:', error);
            const { data: row } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username.trim().toLowerCase())
                .maybeSingle();
            return row === null;
        }
        return data === true;
    } catch (e) {
        console.error('[auth_backend_logic] checkUsernameAvailable exception:', e);
        return false;
    }
}

export async function setOnboardingStep(stepNumber) {
    try {
        const { data, error } = await supabase.rpc('set_onboarding_step', {
            step_number: stepNumber
        });
        if (error) {
            console.error('[auth_backend_logic] setOnboardingStep error:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('[auth_backend_logic] setOnboardingStep exception:', e);
        return false;
    }
}

export async function completeOnboarding(userId) {
    try {
        const { data, error } = await supabase.rpc('complete_onboarding', {
            user_id: userId || null
        });
        if (error) {
            console.error('[auth_backend_logic] completeOnboarding error:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('[auth_backend_logic] completeOnboarding exception:', e);
        return false;
    }
}

export async function updateProfileRole(userId, role) {
    if (!userId || !role) return false;
    const cleanRole = role.toUpperCase() === 'BUYER' ? 'BUYER' : 'USER';
    try {
        const { error } = await supabase
            .from('profiles')
            .update({ role: cleanRole })
            .eq('id', userId);

        if (error) {
            console.error('[auth_backend_logic] updateProfileRole error:', error);
            return false;
        }
        localStorage.setItem('user_role', cleanRole);
        return true;
    } catch (e) {
        console.error('[auth_backend_logic] updateProfileRole exception:', e);
        return false;
    }
}

export async function signOut() {
    await supabase.auth.signOut();
    sessionStorage.clear();
    localStorage.removeItem('user_role');
    localStorage.removeItem('waitEmailCheck');
    localStorage.removeItem('verification_email');
    localStorage.removeItem('ttbd_pending_role');
    localStorage.removeItem('oauth_pending_role');
    window.location.href = PATH.login;
}

// ─── Routing & Guards ─────────────────────────────────────────────────────────

export function routeByOnboarding(profile) {
    if (!profile) return;

    if (profile.status === 'banned') {
        signOut();
        return;
    }

    const role = (profile.role || 'USER').toUpperCase();
    const onboarded = profile.onboarding_completed === true;
    const step = profile.onboarding_step || 0;

    localStorage.setItem('user_role', role);

    if (onboarded) {
        window.location.href = role === 'BUYER' ? PATH.buyerDash : PATH.userDash;
        return;
    }

    // Step-based progression
    if (step === 2) {
        window.location.href = role === 'BUYER' ? PATH.buyerGuideline : PATH.userGuideline;
    } else {
        window.location.href = role === 'BUYER' ? PATH.buyerWelcome : PATH.userWelcome;
    }
}

export async function requireAuth(requiredRole = null) {
    const session = await getSession();
    if (!session?.user) {
        window.location.href = PATH.login;
        return null;
    }

    // Email confirmation enforcement
    if (!session.user.email_confirmed_at) {
        localStorage.setItem('verification_email', session.user.email || '');
        window.location.href = PATH.emailVerify;
        return null;
    }

    const profile = await getProfile(session.user.id);
    if (!profile) {
        await signOut();
        return null;
    }

    if (profile.status === 'banned') {
        await signOut();
        return null;
    }

    const role = (profile.role || 'USER').toUpperCase();
    localStorage.setItem('user_role', role);

    // Enforce role isolation
    if (requiredRole && role !== requiredRole.toUpperCase()) {
        routeByOnboarding(profile);
        return null;
    }

    return { session, profile };
}

export function injectNavbar(fullName) {
    if (typeof window.updateNavbarAuth === 'function') {
        window.updateNavbarAuth();
    }
}

// ─── OAuth Return Callback Handler ───────────────────────────────────────────
export async function handleAuthCallback() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.user) {
            console.error('[auth_backend_logic] handleAuthCallback error:', error);
            window.location.href = PATH.login;
            return;
        }

        const userId = session.user.id;
        let profile = await getProfile(userId);

        // Check if there was a pending role chosen during Google sign-up
        const pendingRole = sessionStorage.getItem('ttbd_pending_role') || localStorage.getItem('oauth_pending_role');

        if (pendingRole && profile && !profile.onboarding_completed) {
            const cleanRole = pendingRole.toUpperCase() === 'BUYER' ? 'BUYER' : 'USER';
            if (profile.role !== cleanRole) {
                await updateProfileRole(userId, cleanRole);
                profile.role = cleanRole;
            }
        }

        // Clean up storage flags
        sessionStorage.removeItem('ttbd_pending_role');
        localStorage.removeItem('oauth_pending_role');

        if (profile?.status === 'banned') {
            await signOut();
            return;
        }

        routeByOnboarding(profile);
    } catch (err) {
        console.error('[auth_backend_logic] handleAuthCallback exception:', err);
        window.location.href = PATH.login;
    }
}

// ─── Re-exported Helpers ──────────────────────────────────────────────────────
export function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || '').trim());
}

export function validatePassword(password) {
    if (!password || password.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    return null;
}

export function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 12) {
        return 'Username must be between 3 and 12 characters.';
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
        return 'Username can only contain lowercase letters, numbers, and underscores.';
    }
    return null;
}

export function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function showInlineError(elementOrId, message) {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;

    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        el.style.borderColor = '#ef4444';
        let errorContainer = el.parentElement.querySelector('.field-error');
        if (!errorContainer) {
            errorContainer = document.createElement('p');
            errorContainer.className = 'field-error text-red-500 text-xs mt-1 font-semibold';
            el.parentElement.appendChild(errorContainer);
        }
        errorContainer.textContent = message;
    } else {
        el.textContent = message;
        el.classList.remove('hidden');
    }
}

export function clearInlineError(elementOrId) {
    const el = typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
    if (!el) return;

    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
        el.style.borderColor = '';
        const errorContainer = el.parentElement.querySelector('.field-error');
        if (errorContainer) {
            errorContainer.textContent = '';
        }
    } else {
        el.textContent = '';
        el.classList.add('hidden');
    }
}

export function setButtonLoading(btn, text = 'Loading…') {
    if (!btn) return;
    if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> ${text}
    `;
}

export function resetButton(btn) {
    if (!btn || !btn.dataset.originalHtml) return;
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml;
}

export function showToast(message, type = 'success') {
    let toast = document.getElementById('auth-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'auth-toast';
        toast.style.cssText = [
            'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
            'padding:14px 20px', 'border-radius:12px', 'font-weight:700',
            'font-size:14px', 'max-width:380px', 'box-shadow:0 12px 30px rgba(0,0,0,0.18)',
            'transition:all 0.3s cubic-bezier(0.16, 1, 0.3, 1)', 'opacity:0', 'transform:translateY(20px)'
        ].join(';');
        document.body.appendChild(toast);
    }

    const colors = {
        success: { bg: '#13ec5b', color: '#0d1b12' },
        error:   { bg: '#ef4444', color: '#ffffff' },
        info:    { bg: '#3b82f6', color: '#ffffff' }
    };
    const c = colors[type] || colors.info;
    toast.style.background = c.bg;
    toast.style.color = c.color;
    toast.textContent = message;

    void toast.offsetWidth;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
    }, 4000);
}

export function mapAuthError(error) {
    if (!error) return 'An unexpected error occurred.';
    const msg = (error.message || '').toLowerCase();
    const status = error.status || 0;

    if (status === 429 || msg.includes('rate limit') || msg.includes('email rate limit')) {
        return 'Too many requests. Please wait before trying again.';
    }
    if (msg.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (msg.includes('email not confirmed')) return 'Please verify your email before logging in.';
    if (msg.includes('user already registered')) return 'An account with this email already exists.';
    if (msg.includes('password should be at least')) return 'Password must be at least 8 characters long.';
    if (msg.includes('token has expired')) return 'Verification code expired. Please request a new one.';
    if (msg.includes('token is invalid') || msg.includes('invalid otp')) return 'Invalid code. Please try again.';

    return error.message || 'An unexpected error occurred.';
}
