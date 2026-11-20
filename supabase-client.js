/**
 * supabase-client.js — Single Shared Supabase Client Instance
 * Time Task BD — Production Client
 * 
 * NOTE: Only the Supabase Project URL and the public anon key are placed in client-side code.
 * Service role keys must NEVER be exposed to the browser.
 */

(function () {
  const SUPABASE_URL = 'https://kdoouzlmncekkozjrsdf.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtkb291emxtbmNla2tvempyc2RmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5ODY5MjIsImV4cCI6MjA4NjU2MjkyMn0.7lsbYQ594Ix8LSXLs6RHYfljiO2A5P70XAjPsqWo8bs';

  if (typeof window !== 'undefined') {
    if (!window.supabaseClient) {
      if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
          }
        });
      } else {
        // Fallback placeholder; will initialize once supabase-js CDN loads
        console.warn('[supabase-client] Supabase JS CDN not detected yet. Awaiting script load.');
      }
    }
    window.SUPABASE_CONFIG = {
      url: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY
    };
  }
})();
