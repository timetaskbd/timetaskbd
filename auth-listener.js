/**
 * auth-listener.js — Redirect logged-in users from public pages to their dashboard.
 * Include AFTER supabase-client.js + auth-helpers.js on landing pages only.
 */
(function () {
    const SKIP_PATHS = [
        'home_page.html',
        'login_page.html',
        'register_page.html',
        'email verifycation page.html',
        'oauth-callback.html',
        'forgot password page.html',
        'reset password page.html',
        'admin_login.html'
    ];

    const PROTECTED_PATHS = [
        'user welcome pop up.html',
        'buyer welcome pop up.html',
        'user guideline.html',
        'buyer guideline.html',
        'user_index.html',
        'buyer index.html',
        'admin dashboard'
    ];

    function currentPathLower() {
        return window.location.pathname.toLowerCase();
    }

    function isOnPath(list) {
        const path = currentPathLower();
        return list.some((fragment) => path.includes(fragment));
    }

    function shouldSkipRedirect() {
        return isOnPath(SKIP_PATHS) || isOnPath(PROTECTED_PATHS);
    }

    async function handleSignedIn(session) {
        if (!session?.user || shouldSkipRedirect()) return;
        await routeAfterLogin(session, { skipFraudCheck: true });
    }

    function initAuthListener() {
        if (!window.supabaseClient || typeof routeAfterLogin !== 'function') {
            console.warn('[auth-listener] missing dependencies');
            return;
        }

        window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                try {
                    await handleSignedIn(session);
                } catch (err) {
                    console.error('[auth-listener] redirect error:', err);
                }
            }
            if (event === 'SIGNED_OUT') {
                localStorage.removeItem('user_role');
                localStorage.removeItem('waitEmailCheck');
                localStorage.removeItem('verification_email');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthListener);
    } else {
        initAuthListener();
    }
})();
