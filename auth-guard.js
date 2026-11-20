/**
 * auth-guard.js
 * 
 * Global authentication guard for role-based UI management.
 * Handles:
 * 1. Supabase Client Initialization (if missing)
 * 2. User Role Detection (Buyer vs User)
 * 3. UI Manipulation (Hiding "Earning Page" for Buyers)
 * 4. Route Protection (Redirecting Buyers from Earning Page)
 */

(function() {
    // Configuration
    const SUPABASE_URL = 'https://kdoouzlmncekkozjrsdf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtkb291emxtbmNla2tvempyc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODY5MjIsImV4cCI6MjA4NjU2MjkyMn0.7lsbYQ594Ix8LSXLs6RHYfljiO2A5P70XAjPsqWo8bs';

    async function initAuthGuard() {
        console.log('Auth Guard: Starting...');
        
        // 1. Initialize Supabase
        let _supabase = window.supabaseClient;

        if (!_supabase) {
            if (typeof supabase !== 'undefined') {
                _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                window.supabaseClient = _supabase;
                console.log('Auth Guard: Supabase client initialized.');
            } else {
                console.warn('Auth Guard: Supabase JS library not loaded. Ensure supabase-js is included.');
                return;
            }
        }

        // 2. Get User Session
        const { data: { session } } = await _supabase.auth.getSession();
        
        if (!session) {
            // User not logged in, clear role cache just in case
            localStorage.removeItem('user_role');
            return;
        }

        // 3. Get User Role
        // Check cache first
        let role = localStorage.getItem('user_role');

        if (!role) {
            // Try to get role from user_metadata first (faster)
            if (session.user.user_metadata && session.user.user_metadata.role) {
                role = session.user.user_metadata.role;
            } else {
                // Fallback: Query profiles table
                try {
                    const { data: profile } = await _supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', session.user.id)
                        .single();
                    
                    if (profile) {
                        role = profile.role;
                    }
                } catch (err) {
                    console.error('Auth Guard: Error fetching role from DB', err);
                }
            }

            // Cache the role if found
            if (role) {
                localStorage.setItem('user_role', role);
            }
        }

        // 4. Apply Logic based on Role
        const normalizedRole = (role || '').toString().toUpperCase();
        if (normalizedRole === 'BUYER') {
            applyBuyerRestrictions();
        }
    }

    function applyBuyerRestrictions() {
        console.log('Auth Guard: Applying Buyer restrictions.');

        // A. Navbar Manager: Hide "Earning Page" link
        const links = document.querySelectorAll('a');
        links.forEach(link => {
            const text = link.textContent.trim();
            const href = link.getAttribute('href');

            // Check by text content or href
            if ((text === 'Earning Page') || (href && href.includes('Earning_Page.html'))) {
                link.style.display = 'none'; 
            }
        });

        // B. Route Protector: Redirect if on Earning Page
        const currentPath = window.location.pathname;
        if (currentPath.includes('Earning_Page.html')) {
            console.log('Auth Guard: Access denied for Buyer. Redirecting...');
            // Redirect to Buyer Dashboard Index
            window.location.href = '../Buyer Dashboard/Buyer Index.html';
        }
    }

    // Run initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthGuard);
    } else {
        initAuthGuard();
    }

})();
