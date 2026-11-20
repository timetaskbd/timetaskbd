/**
 * fraud-detection.js
 * ──────────────────────────────────────────────────────────────────────────────
 * IP Fraud Detection System — Time Task BD
 *
 * Provides:
 *   • getUserIP()               — fetch public IP via api64.ipify.org
 *   • getDeviceInfo()           — collect userAgent, screen size, timezone
 *   • saveUserSession()         — persist session data to Supabase
 *   • checkVpnProxy()           — VPN/proxy detection via ipapi.co (bonus)
 *   • checkDuplicateIP()        — flag if ≥4 accounts share the same IP
 *   • checkRapidSubmissions()   — flag if user submits >20 tasks in 1 minute
 *   • checkHighRejection()      — flag if user has >5 rejected submissions
 *   • runFraudChecks()          — orchestrate all checks on login / submission
 *
 * ─── Reference SQL Queries ───────────────────────────────────────────────────
 *
 * 1. Duplicate IP (>3 accounts sharing same IP):
 *    SELECT ip_address, COUNT(DISTINCT user_id) AS number_of_accounts
 *    FROM user_sessions
 *    GROUP BY ip_address
 *    HAVING COUNT(DISTINCT user_id) > 3
 *    ORDER BY number_of_accounts DESC;
 *
 *    (This is also available as the view: public.v_duplicate_ips)
 *
 * 2. Rapid submission detection (>20 tasks in 1 minute):
 *    SELECT user_id, COUNT(*) AS submissions_in_last_minute
 *    FROM task_submissions
 *    WHERE submitted_at > NOW() - INTERVAL '1 minute'
 *    GROUP BY user_id
 *    HAVING COUNT(*) > 20;
 *
 * 3. High rejection rate:
 *    SELECT user_id, COUNT(*) AS rejected_count
 *    FROM task_submissions
 *    WHERE status = 'rejected'
 *    GROUP BY user_id
 *    HAVING COUNT(*) > 5;
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Configuration ────────────────────────────────────────────────────────────
const FRAUD_CONFIG = {
  DUPLICATE_IP_THRESHOLD:   4,   // alert when ≥4 distinct accounts share an IP
  RAPID_SUBMISSION_LIMIT:   20,  // alert when >20 submissions in 1 minute
  RAPID_SUBMISSION_WINDOW:  60,  // seconds
  REJECTION_THRESHOLD:      5,   // alert when >5 rejected submissions
  VPN_CHECK_TIMEOUT:        5000 // ms — ipapi.co request timeout
};

// ─── 1. Get Public IP ─────────────────────────────────────────────────────────
/**
 * Fetches the user's current public IP address using api64.ipify.org.
 * @returns {Promise<string|null>}  IP address string or null on failure.
 */
async function getUserIP() {
  try {
    const res = await fetch('https://api64.ipify.org?format=json');
    if (!res.ok) return null;
    const { ip } = await res.json();
    return ip || null;
  } catch {
    console.warn('[FraudDetection] IP fetch failed.');
    return null;
  }
}

// ─── 2. Collect Device Info ───────────────────────────────────────────────────
/**
 * Collects basic device fingerprint data using browser APIs.
 * @returns {{ userAgent: string, screen: string, timezone: string }}
 */
function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    screen:    `${screen.width}x${screen.height}`,
    timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

// ─── 3. Save Session to Supabase ──────────────────────────────────────────────
/**
 * Inserts a row into public.user_sessions.
 * @param {string}  userId       — Supabase auth user UUID
 * @param {string}  ip           — public IP address
 * @param {object}  deviceInfo   — result of getDeviceInfo()
 * @param {boolean} isVpn        — VPN/proxy flag
 * @param {object|null} vpnInfo  — raw ipapi.co response or null
 * @param {string}  sessionType  — 'login' | 'task_submission'
 * @param {object}  supabase     — Supabase client instance
 * @returns {Promise<void>}
 */
async function saveUserSession(userId, ip, deviceInfo, isVpn = false, vpnInfo = null, sessionType = 'login', supabase) {
  if (!userId || !ip) return;
  const { error } = await supabase.from('user_sessions').insert({
    user_id:       userId,
    ip_address:    ip,
    user_agent:    deviceInfo.userAgent,
    device_screen: deviceInfo.screen,
    timezone:      deviceInfo.timezone,
    is_vpn:        isVpn,
    vpn_info:      vpnInfo,
    session_type:  sessionType
  });
  if (error) console.warn('[FraudDetection] Session insert error:', error.message);
}

// ─── 4. VPN / Proxy Detection (Bonus) ────────────────────────────────────────
/**
 * Checks whether the given IP is a VPN or proxy using ipapi.co.
 * Returns a safe default (not VPN) if the request fails or times out.
 * @param {string} ip
 * @returns {Promise<{ isVpn: boolean, data: object|null }>}
 */
async function checkVpnProxy(ip) {
  if (!ip) return { isVpn: false, data: null };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FRAUD_CONFIG.VPN_CHECK_TIMEOUT);
    const res = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { isVpn: false, data: null };
    const data = await res.json();
    // ipapi.co reports VPN-related fields
    const isVpn = !!(data.tor || data.proxy || data.hosting);
    return { isVpn, data };
  } catch {
    console.warn('[FraudDetection] VPN check failed (timeout or network error).');
    return { isVpn: false, data: null };
  }
}

// ─── 5. Insert Fraud Alert ────────────────────────────────────────────────────
/**
 * Inserts a fraud alert row into public.fraud_alerts.
 * @param {string} userId
 * @param {string} ip
 * @param {string} reason   — 'duplicate_ip' | 'rapid_submission' | 'high_rejection' | 'vpn_proxy'
 * @param {object} details  — arbitrary extra data
 * @param {object} supabase — Supabase client instance
 */
async function insertFraudAlert(userId, ip, reason, details, supabase) {
  const { error } = await supabase.from('fraud_alerts').insert({
    user_id:    userId,
    ip_address: ip,
    reason,
    details
  });
  if (error) console.warn('[FraudDetection] Alert insert error:', error.message);
  else console.info(`[FraudDetection] 🚨 Alert: ${reason} for user ${userId.slice(0, 8)}`);
}

// ─── 6. Check Duplicate IP ────────────────────────────────────────────────────
/**
 * Checks if the given IP is shared by ≥ DUPLICATE_IP_THRESHOLD distinct accounts.
 * @param {string} userId
 * @param {string} ip
 * @param {object} supabase
 * @returns {Promise<boolean>}  true if flagged
 */
async function checkDuplicateIP(userId, ip, supabase) {
  if (!ip) return false;
  const { data, error } = await supabase
    .from('user_sessions')
    .select('user_id')
    .eq('ip_address', ip);

  if (error || !data) return false;

  const uniqueAccounts = new Set(data.map(r => r.user_id)).size;
  if (uniqueAccounts >= FRAUD_CONFIG.DUPLICATE_IP_THRESHOLD) {
    await insertFraudAlert(userId, ip, 'duplicate_ip', {
      accounts_on_ip: uniqueAccounts,
      threshold:      FRAUD_CONFIG.DUPLICATE_IP_THRESHOLD
    }, supabase);
    return true;
  }
  return false;
}

// ─── 7. Check Rapid Submissions ───────────────────────────────────────────────
/**
 * Flags the user if they submitted more than RAPID_SUBMISSION_LIMIT tasks
 * within the last RAPID_SUBMISSION_WINDOW seconds.
 * @param {string} userId
 * @param {string} ip
 * @param {object} supabase
 * @returns {Promise<boolean>}  true if flagged
 */
async function checkRapidSubmissions(userId, ip, supabase) {
  const sinceISO = new Date(
    Date.now() - FRAUD_CONFIG.RAPID_SUBMISSION_WINDOW * 1000
  ).toISOString();

  const { count, error } = await supabase
    .from('task_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('submitted_at', sinceISO);

  if (error) return false;

  if ((count || 0) > FRAUD_CONFIG.RAPID_SUBMISSION_LIMIT) {
    await insertFraudAlert(userId, ip, 'rapid_submission', {
      submissions_in_window: count,
      window_seconds:        FRAUD_CONFIG.RAPID_SUBMISSION_WINDOW,
      limit:                 FRAUD_CONFIG.RAPID_SUBMISSION_LIMIT
    }, supabase);
    return true;
  }
  return false;
}

// ─── 8. Check High Rejection Rate ────────────────────────────────────────────
/**
 * Flags the user if their total rejected submissions exceed REJECTION_THRESHOLD.
 * @param {string} userId
 * @param {string} ip
 * @param {object} supabase
 * @returns {Promise<boolean>}  true if flagged
 */
async function checkHighRejection(userId, ip, supabase) {
  const { count, error } = await supabase
    .from('task_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'rejected');

  if (error) return false;

  if ((count || 0) > FRAUD_CONFIG.REJECTION_THRESHOLD) {
    await insertFraudAlert(userId, ip, 'high_rejection', {
      rejected_count: count,
      threshold:      FRAUD_CONFIG.REJECTION_THRESHOLD
    }, supabase);
    return true;
  }
  return false;
}

// ─── 9. Orchestrator ──────────────────────────────────────────────────────────
/**
 * Run all fraud checks for a user. Call this on login or task submission.
 *
 * Usage (login):
 *   await runFraudChecks(session.user.id, _sb, 'login');
 *
 * Usage (task submission):
 *   await runFraudChecks(session.user.id, _sb, 'task_submission');
 *
 * @param {string} userId      — Supabase auth user UUID
 * @param {object} supabase    — Supabase client instance
 * @param {string} sessionType — 'login' | 'task_submission'
 * @returns {Promise<{ ip: string|null, flags: string[] }>}
 */
async function runFraudChecks(userId, supabase, sessionType = 'login') {
  if (!userId) return { ip: null, flags: [] };

  // Collect data concurrently
  const [ip, deviceInfo] = await Promise.all([
    getUserIP(),
    Promise.resolve(getDeviceInfo())
  ]);

  // VPN/proxy check (bonus) — run concurrently with session save
  const [vpnResult] = await Promise.all([
    checkVpnProxy(ip)
  ]);

  const { isVpn, data: vpnData } = vpnResult;

  // Persist session
  await saveUserSession(userId, ip, deviceInfo, isVpn, vpnData, sessionType, supabase);

  // Run fraud checks concurrently
  const [dupIP, rapidSub, highRej] = await Promise.all([
    checkDuplicateIP(userId, ip, supabase),
    checkRapidSubmissions(userId, ip, supabase),
    checkHighRejection(userId, ip, supabase)
  ]);

  // VPN alert
  if (isVpn && ip) {
    await insertFraudAlert(userId, ip, 'vpn_proxy', {
      vpn_details: vpnData
    }, supabase);
  }

  const flags = [
    dupIP       ? 'duplicate_ip'      : null,
    rapidSub    ? 'rapid_submission'  : null,
    highRej     ? 'high_rejection'    : null,
    isVpn       ? 'vpn_proxy'         : null
  ].filter(Boolean);

  if (flags.length > 0) {
    console.warn('[FraudDetection] Flags triggered:', flags.join(', '));
  } else {
    console.info('[FraudDetection] ✅ No fraud signals detected.');
  }

  return { ip, flags };
}

// ─── Expose globally for use in other pages ───────────────────────────────────
window.FraudDetection = {
  getUserIP,
  getDeviceInfo,
  saveUserSession,
  checkVpnProxy,
  checkDuplicateIP,
  checkRapidSubmissions,
  checkHighRejection,
  insertFraudAlert,
  runFraudChecks,
  FRAUD_CONFIG
};
