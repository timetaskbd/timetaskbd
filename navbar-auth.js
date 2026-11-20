// navbar-auth.js - Robust Role-Based UI Injection

async function updateNavbarAuth() {
  const _supabase = window.supabaseClient;
  if (!_supabase) {
    console.error("Supabase client not found! Ensure supabase-client.js is loaded.");
    return;
  }

  // Check Session
  const { data: { session } } = await _supabase.auth.getSession();

  // Find the Container
  // 1. Try finding by ID first
  let authContainer = document.getElementById('navbar-auth-container');

  // 2. If not found, try to find the parent container to inject it
  if (!authContainer) {
    // Select the right-aligned nav section
    const rightNav = document.querySelector('.flex.items-center.justify-end.flex-grow');
    if (rightNav) {
      // Look for the existing auth buttons wrapper (Login/Register)
      // Usually it's the last child or has gap-3
      const existingWrapper = rightNav.querySelector('.flex.items-center.gap-3') || rightNav.lastElementChild;
      if (existingWrapper) {
        authContainer = existingWrapper;
        authContainer.id = 'navbar-auth-container'; // Assign ID for future ref
      }
    }
  }

  if (!authContainer) {
    console.warn("Navbar Auth Container not found. Skipping UI update.");
    return;
  }

  // Logic: If Session exists -> Render Profile Dropdown. If not -> Render Login/Register (or keep default).
  if (session) {
    // --- 1. Get User Role & Info ---
    let userRole = 'USER'; // Default uppercase

    // Check metadata
    if (session.user.user_metadata && session.user.user_metadata.role) {
      userRole = session.user.user_metadata.role.toUpperCase();
    } else {
      // Fallback: Check LocalStorage if set by auth-guard.js
      const cachedRole = localStorage.getItem('user_role');
      if (cachedRole) userRole = cachedRole.toUpperCase();
    }

    // Double Check: If we are on a Buyer Dashboard page, assume Buyer context if role is ambiguous
    if (window.location.pathname.includes('/Buyer Dashboard/') && userRole === 'USER') {
      // Optional: You might want to force Buyer UI here if the user is allowed
      // userRole = 'BUYER'; 
    }

    const fullName = session.user.user_metadata?.full_name || session.user.email.split('@')[0];
    const initial = fullName.charAt(0).toUpperCase();

    // --- 2. Define HTML Templates ---

    // Common Elements
    // Dark Mode Toggle (Preserved)
    const darkModeBtn = `
      <button id="themeToggleBtn" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-sidebar-deep dark:hover:text-primary hover:bg-primary/10 transition-all">
        <span class="material-symbols-outlined text-[22px] theme-icon"></span>
      </button>
    `;

    // Notification Dropdown (Preserved/Re-injected)
    // Note: We use a simplified version here. If complex logic exists in main scripts, 
    // it's better to hide/show than re-render. But user asked to re-render correctly.
    const notificationHTML = `
      <div class="relative">
        <button id="navNotificationBtn" class="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 hover:text-sidebar-deep dark:hover:text-primary hover:bg-primary/10 transition-all">
          <span class="material-symbols-outlined text-xl">notifications</span>
        </button>
        <!-- Dropdown Content (Hidden by default) -->
        <div id="navNotificationDropdown" class="absolute top-full right-0 mt-3 z-50 w-screen max-w-[320px] hidden transform origin-top-right transition-all">
          <div class="bg-white dark:bg-[#1a2e1e] rounded-xl shadow-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
             <div class="p-4 border-b border-gray-100 dark:border-white/10">
               <h3 class="text-gray-900 dark:text-white font-bold">Notifications</h3>
             </div>
             <div class="p-8 text-center text-gray-400 text-sm">No new notifications</div>
          </div>
        </div>
      </div>
    `;

    let profileDropdownHTML = '';

    if (userRole === 'BUYER') {
      // Hide Earning Page Link if present in DOM (Double safety)
      const earningLink = document.querySelector('a[href*="Earning_Page.html"]');
      if (earningLink) earningLink.style.display = 'none';

      // --- BUYER TEMPLATE (Slate/Accent-Green Theme) ---
      profileDropdownHTML = `
      <div class="relative group pl-4 border-l border-slate-200 ml-1">
        <button class="flex items-center gap-2 focus:outline-none">
          <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 bg-accent-green flex items-center justify-center font-bold text-white shadow-lg shadow-accent-green/20 cursor-pointer hover:scale-105 transition-transform">
            ${initial}
          </div>
          <span class="material-symbols-outlined text-slate-400 text-sm group-hover:text-accent-green transition-colors">keyboard_arrow_down</span>
        </button>
        <div class="absolute right-0 top-full mt-3 w-64 bg-brand-bg border border-slate-200 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[60] overflow-hidden transform group-hover:translate-y-0 translate-y-2">
          <div class="p-4 border-b border-slate-200 bg-white">
            <p class="text-[10px] font-bold text-secondary-text uppercase tracking-widest mb-1">Signed in as</p>
            <p class="text-sm font-extrabold text-primary-text truncate">${fullName}</p>
          </div>
          <div class="p-2">
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white transition-colors group/item" href="/Buyer Dashboard/Buyer Index.html">
              <span class="material-symbols-outlined text-accent-green">dashboard</span>
              <span class="text-sm font-bold text-slate-700 group-hover/item:text-primary-text">My Dashboard</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white transition-colors group/item" href="/Buyer Dashboard/Account Setting Buyer.html">
              <span class="material-symbols-outlined text-accent-green">manage_accounts</span>
              <span class="text-sm font-bold text-slate-700 group-hover/item:text-primary-text">Account Settings</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white transition-colors group/item" href="/Buyer Dashboard/Support Buyer.html">
              <span class="material-symbols-outlined text-accent-green">help_center</span>
              <span class="text-sm font-bold text-slate-700 group-hover/item:text-primary-text">Support Center</span>
            </a>
          </div>
          <div class="p-2 border-t border-slate-200">
            <a id="nav-logout-btn" class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 transition-colors group/item cursor-pointer">
              <span class="material-symbols-outlined text-red-500">logout</span>
              <span class="text-sm font-bold text-red-500">Logout</span>
            </a>
          </div>
        </div>
      </div>`;
    } else {
      // --- USER TEMPLATE (Primary Green/Dark Mode Theme) ---
      profileDropdownHTML = `
      <div class="relative group pl-4 border-l border-[#e7f3eb] dark:border-white/10 ml-1">
        <button class="flex items-center gap-2 focus:outline-none">
          <div class="bg-center bg-no-repeat aspect-square bg-cover rounded-xl size-10 bg-primary flex items-center justify-center font-bold text-[#0d1b12] shadow-lg shadow-primary/20 cursor-pointer hover:scale-105 transition-transform">
            ${initial}
          </div>
          <span class="material-symbols-outlined text-slate-400 text-sm group-hover:text-primary transition-colors">keyboard_arrow_down</span>
        </button>
        <div class="absolute right-0 top-full mt-3 w-64 bg-white dark:bg-[#102216] border border-[#e7f3eb] dark:border-white/10 rounded-2xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-[60] overflow-hidden transform group-hover:translate-y-0 translate-y-2">
          <div class="p-4 border-b border-[#e7f3eb] dark:border-white/10 bg-white dark:bg-[#102216]">
            <p class="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1">Signed in as</p>
            <p class="text-sm font-extrabold text-[#0d1b12] dark:text-white truncate">${fullName}</p>
          </div>
          <div class="p-2">
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#e7f3eb] dark:hover:bg-white/5 transition-colors group/item" href="/User Dashboard/User_Index.html">
              <span class="material-symbols-outlined text-primary">dashboard</span>
              <span class="text-sm font-bold text-[#0d1b12] dark:text-white group-hover/item:text-primary">My Dashboard</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#e7f3eb] dark:hover:bg-white/5 transition-colors group/item" href="/User Dashboard/Add Task.html">
              <span class="material-symbols-outlined text-primary">list_alt</span>
              <span class="text-sm font-bold text-[#0d1b12] dark:text-white group-hover/item:text-primary">Task Active</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#e7f3eb] dark:hover:bg-white/5 transition-colors group/item" href="/User Dashboard/Account_Setting_User.html">
              <span class="material-symbols-outlined text-primary">manage_accounts</span>
              <span class="text-sm font-bold text-[#0d1b12] dark:text-white group-hover/item:text-primary">Account Settings</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#e7f3eb] dark:hover:bg-white/5 transition-colors group/item" href="/User Dashboard/Refer Earn Page.html">
              <span class="material-symbols-outlined text-primary">group</span>
              <span class="text-sm font-bold text-[#0d1b12] dark:text-white group-hover/item:text-primary">Refer & Earn</span>
            </a>
            <a class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-[#e7f3eb] dark:hover:bg-white/5 transition-colors group/item" href="/User Dashboard/Support_User.html">
              <span class="material-symbols-outlined text-primary">help_center</span>
              <span class="text-sm font-bold text-[#0d1b12] dark:text-white group-hover/item:text-primary">Support Center</span>
            </a>
          </div>
          <div class="p-2 border-t border-[#e7f3eb] dark:border-white/10">
            <a id="nav-logout-btn" class="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors group/item cursor-pointer">
              <span class="material-symbols-outlined text-red-500">logout</span>
              <span class="text-sm font-bold text-red-500">Logout</span>
            </a>
          </div>
        </div>
      </div>`;
    }

    // --- 3. Inject and Bind ---
    // We replace the content of authContainer
    authContainer.innerHTML = `
      ${darkModeBtn}
      ${notificationHTML}
      ${profileDropdownHTML}
    `;

    // --- 4. Bind Events ---

    // Bind Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        const icon = themeBtn.querySelector('.theme-icon');
        if (icon) {
          icon.textContent = isDark ? 'dark_mode' : 'light_mode';
        }
      });

      // Set initial icon state
      const isDark = document.documentElement.classList.contains('dark');
      const icon = themeBtn.querySelector('.theme-icon');
      if (icon) {
        icon.textContent = isDark ? 'dark_mode' : 'light_mode';
      }
    }

    if (typeof bindLogoutLinks === 'function') {
      bindLogoutLinks();
    } else {
      const logoutBtn = document.getElementById('nav-logout-btn');
      if (logoutBtn && !logoutBtn.dataset.logoutBound) {
        logoutBtn.dataset.logoutBound = '1';
        logoutBtn.addEventListener('click', async () => {
          const { error } = await _supabase.auth.signOut();
          if (error) console.error('Logout error:', error);
          localStorage.removeItem('user_role');
          
          const depth = window.location.pathname.split('/').filter(Boolean).length;
          const isWebDash = window.location.pathname.toLowerCase().includes('/web dashboard/');
          const root = depth > (isWebDash ? 2 : 1) ? '../' : './';
          
          window.location.href = root + 'Web Dashboard/Login_Page.html';
        });
      }
    }

    // Bind Notification Toggle
    const notifBtn = document.getElementById('navNotificationBtn');
    const notifDropdown = document.getElementById('navNotificationDropdown');

    if (notifBtn && notifDropdown) {
      notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
          notifDropdown.classList.add('hidden');
        }
      });
    }

  } else {
    // Not Logged In - Keep Default Login/Register Buttons
    // If the container is empty (somehow), we could inject default buttons, 
    // but usually HTML has them by default.
    // Ensure "Earning Page" is visible if we are not logged in (handled by auth-guard mostly, but good to know)
  }
}

// Auto-run
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', updateNavbarAuth);
} else {
  updateNavbarAuth();
}
