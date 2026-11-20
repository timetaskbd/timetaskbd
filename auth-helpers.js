/**
 * auth-helpers.js — Shared Validation & UI Helpers for Time Task BD
 * Compatible with vanilla browser scripts, inline handlers, and global Supabase client.
 * Version: 2.0 (Security & XSS-hardened)
 */

// ─── 1. Role Normalization ────────────────────────────────────────────────────
function normalizeRole(role) {
    if (!role) return 'USER';
    const upper = String(role).trim().toUpperCase();
    if (upper === 'BUYER') return 'BUYER';
    return 'USER'; // Default fallback
}

// ─── 2. Validation Functions ──────────────────────────────────────────────────
function validateEmail(email) {
    if (!email) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validatePassword(password) {
    if (!password || password.length < 8) {
        return 'Password must be at least 8 characters long.';
    }
    if (!/[A-Z]/.test(password)) {
        return 'Password must contain at least one uppercase letter.';
    }
    if (!/[a-z]/.test(password)) {
        return 'Password must contain at least one lowercase letter.';
    }
    if (!/[0-9]/.test(password)) {
        return 'Password must contain at least one number.';
    }
    return null; // Valid
}

function validateUsername(username) {
    if (!username || username.length < 3 || username.length > 12) {
        return 'Username must be between 3 and 12 characters.';
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
        return 'Username can only contain lowercase letters, numbers, and underscores.';
    }
    return null; // Valid
}

// ─── 3. Uniqueness Checks ─────────────────────────────────────────────────────
async function isUsernameAvailable(username) {
    if (!username) return false;
    const client = window.supabaseClient;
    if (!client) return false;

    try {
        const { data, error } = await client.rpc('check_username_available', {
            uname: username.trim().toLowerCase()
        });
        if (error) {
            console.warn('[auth-helpers] check_username_available RPC error, falling back:', error);
            const { data: row } = await client
                .from('profiles')
                .select('id')
                .eq('username', username.trim().toLowerCase())
                .maybeSingle();
            return row === null;
        }
        return data === true;
    } catch (err) {
        console.error('[auth-helpers] isUsernameAvailable exception:', err);
        return false;
    }
}

// ─── 4. Error Message Mapping ─────────────────────────────────────────────────
function mapAuthError(error) {
    if (!error) return 'An unexpected error occurred.';
    const msg = (error.message || '').toLowerCase();
    const status = error.status || 0;

    if (status === 429 || msg.includes('rate limit') || msg.includes('email rate limit')) {
        return 'Too many requests. Please wait a few minutes before trying again.';
    }
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        return 'Incorrect email or password. Please try again.';
    }
    if (msg.includes('email not confirmed') || msg.includes('email link')) {
        return 'Please verify your email address before logging in.';
    }
    if (msg.includes('user already registered') || msg.includes('already exists') || msg.includes('already been registered')) {
        return 'An account with this email already exists. Please log in instead.';
    }
    if (msg.includes('password should be at least')) {
        return 'Password must be at least 8 characters long with uppercase, lowercase, and numbers.';
    }
    if (msg.includes('token has expired') || msg.includes('otp expired')) {
        return 'The 6-digit verification code has expired. Please request a new one.';
    }
    if (msg.includes('token is invalid') || msg.includes('invalid otp') || msg.includes('otp invalid')) {
        return 'Invalid verification code. Please check your 6-digit OTP and try again.';
    }
    if (msg.includes('user not found')) {
        return 'No account found with this email address.';
    }
    return error.message || 'An unexpected error occurred.';
}

// ─── 5. UI Helpers (Inline Errors, Loading State, Toast) ──────────────────────
function showInlineError(elementOrId, message) {
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

function clearInlineError(elementOrId) {
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

// Compatibility alias
function showError(id, message) { showInlineError(id, message); }
function clearError(id) { clearInlineError(id); }
function clearAllErrors(ids) { (ids || []).forEach(clearInlineError); }

function setButtonLoading(btn, loadingText = 'Loading…') {
    if (!btn) return;
    if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.disabled = true;
    btn.innerHTML = `
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 inline text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg> ${loadingText}
    `;
}

function resetButton(btn) {
    if (!btn || !btn.dataset.originalHtml) return;
    btn.disabled = false;
    btn.innerHTML = btn.dataset.originalHtml;
}

function showToast(message, type = 'success') {
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
        info:    { bg: '#3b82f6', color: '#ffffff' },
        warning: { bg: '#f59e0b', color: '#0d1b12' }
    };
    const c = colors[type] || colors.info;
    toast.style.background = c.bg;
    toast.style.color = c.color;
    toast.textContent = message;

    void toast.offsetWidth; // Force reflow
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
    }, 4000);
}

// ─── 6. XSS Prevention Helper ─────────────────────────────────────────────────
function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ─── 7. Path Helpers (Relative Resolution) ────────────────────────────────────
function _inFolder(folderName) {
    return window.location.pathname.toLowerCase().includes(folderName.toLowerCase());
}

function getLoginPath() {
    if (_inFolder('user dashboard') || _inFolder('buyer dashboard') || _inFolder('admin dashboard')) {
        return '../Web Dashboard/Login_Page.html';
    }
    return 'Login_Page.html';
}

function getEmailVerifyPath() {
    if (_inFolder('web dashboard')) {
        return 'Email Verifycation Page.html';
    }
    return '../Web Dashboard/Email Verifycation Page.html';
}

function getRegisterPath() {
    if (_inFolder('web dashboard')) {
        return 'Register_Page.html';
    }
    return '../Web Dashboard/Register_Page.html';
}

function getUserDashPath() {
    if (_inFolder('user dashboard')) return 'User_Index.html';
    return '../User Dashboard/User_Index.html';
}

function getBuyerDashPath() {
    if (_inFolder('buyer dashboard')) return 'Buyer Index.html';
    return '../Buyer Dashboard/Buyer Index.html';
}

function getUserWelcomePath() {
    if (_inFolder('user dashboard')) return 'User Welcome Pop up.html';
    return '../User Dashboard/User Welcome Pop up.html';
}

function getBuyerWelcomePath() {
    if (_inFolder('buyer dashboard')) return 'Buyer Welcome Pop up.html';
    return '../Buyer Dashboard/Buyer Welcome Pop up.html';
}

function getUserGuidelinePath() {
    if (_inFolder('user dashboard')) return 'User Guideline.html';
    return '../User Dashboard/User Guideline.html';
}

function getBuyerGuidelinePath() {
    if (_inFolder('buyer dashboard')) return 'Buyer Guideline.html';
    return '../Buyer Dashboard/Buyer Guideline.html';
}

// ─── 8. Global State Routing & Logout ─────────────────────────────────────────
async function routeAfterLogin(session, options = {}) {
    const user = session?.user;
    const client = window.supabaseClient;
    if (!user || !client) return false;

    if (!user.email_confirmed_at) {
        localStorage.setItem('verification_email', user.email || '');
        await client.auth.signOut();
        window.location.href = getEmailVerifyPath();
        return true;
    }

    const { data: profile, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (error || !profile) {
        console.error('[auth-helpers] Failed to fetch profile:', error);
        if (options.submitBtn) resetButton(options.submitBtn);
        showToast('Unable to load profile. Please contact support.', 'error');
        return false;
    }

    if (profile.status === 'banned') {
        await client.auth.signOut();
        showToast('Your account has been suspended or banned.', 'error');
        if (options.submitBtn) resetButton(options.submitBtn);
        return false;
    }

    const role = normalizeRole(profile.role);
    localStorage.setItem('user_role', role);

    if (profile.onboarding_completed) {
        window.location.href = role === 'BUYER' ? getBuyerDashPath() : getUserDashPath();
    } else {
        const step = profile.onboarding_step || 0;
        if (step === 2) {
            window.location.href = role === 'BUYER' ? getBuyerGuidelinePath() : getUserGuidelinePath();
        } else {
            window.location.href = role === 'BUYER' ? getBuyerWelcomePath() : getUserWelcomePath();
        }
    }
    return true;
}

async function logoutUser() {
    try {
        if (window.supabaseClient) {
            await window.supabaseClient.auth.signOut();
        }
    } finally {
        sessionStorage.clear();
        localStorage.removeItem('user_role');
        localStorage.removeItem('waitEmailCheck');
        localStorage.removeItem('verification_email');
        localStorage.removeItem('oauth_pending_role');
        window.location.href = getLoginPath();
    }
}
