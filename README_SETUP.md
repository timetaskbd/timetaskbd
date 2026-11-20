# Time Task BD — Supabase Backend & Production Setup Guide

This guide details the complete configuration required in the Supabase Dashboard, database execution steps, and security architecture for **Time Task BD**.

---

## 1. Supabase Project Setup & Credentials

1. Create a project at [supabase.com](https://supabase.com).
2. Navigate to **Project Settings** → **API**.
3. Copy the **Project URL** and the **`anon` `public` API key**.
4. Update the credentials in `supabase-client.js` and `auth_backend_logic.js`:
   ```javascript
   const SUPABASE_URL = 'https://<YOUR-PROJECT-REF>.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```
   > ⚠️ **CRITICAL SECURITY RULE:** Never put the `service_role` secret key in frontend JavaScript files. Only use the `anon` key on the client.

---

## 2. Authentication Configuration

Navigate to **Authentication** in your Supabase Dashboard:

### 2.1 Email Provider & Password Policy
1. Go to **Authentication** → **Providers** → **Email**.
2. **Enable Email provider**: Turn **ON**.
3. **Confirm email**: Turn **ON** (Required for the `Email Verifycation Page.html` flow).
4. **Secure email change**: Turn **ON**.
5. Go to **Authentication** → **Attack Protection** / **Password Policy**:
   - Minimum password length: **8**
   - Require uppercase, lowercase, numbers: **ON**

### 2.2 6-Digit OTP Email Templates
Time Task BD uses 6-digit numeric OTP verification codes for email confirmation and password recovery instead of clickable redirect links.

Go to **Authentication** → **Email Templates**:

#### A. Reset Password (Recovery) Template
- **Subject**: `Reset Your Password — Time Task BD`
- **Body**:
  ```html
  <h2>Reset Your Password</h2>
  <p>Use the following 6-digit verification code to reset your password:</p>
  <h1 style="font-size: 32px; letter-spacing: 6px; font-weight: bold; color: #13ec5b;">{{ .Token }}</h1>
  <p>This code expires in 10 minutes. If you did not request this, please ignore this email.</p>
  ```

#### B. Confirm Signup (Email Verification) Template
- **Subject**: `Verify Your Email — Time Task BD`
- **Body**:
  ```html
  <h2>Welcome to Time Task BD!</h2>
  <p>Your 6-digit account verification code is:</p>
  <h1 style="font-size: 32px; letter-spacing: 6px; font-weight: bold; color: #13ec5b;">{{ .Token }}</h1>
  <p>Enter this code on the verification screen to activate your account.</p>
  ```

### 2.3 Custom SMTP Server (Mandatory for Production)
The default Supabase free tier email service is strictly rate-limited to **3 emails per hour**. For live user traffic, you must configure custom SMTP:
1. Go to **Authentication** → **Settings** → **SMTP Settings**.
2. Turn **Enable Custom SMTP** to **ON**.
3. Enter your SMTP credentials (from Resend, SendGrid, Brevo, or AWS SES):
   - **Sender email**: `noreply@timetaskbd.com`
   - **Sender name**: `Time Task BD`
   - **Host**, **Port** (usually `587` with TLS or `465` with SSL), **User**, and **Password**.

### 2.4 Redirect URLs Whitelist
Go to **Authentication** → **URL Configuration**:
- **Site URL**: `http://localhost:3000/Web%20Dashboard/Home_Page.html` (or your production URL, e.g. `https://timetaskbd.com/Web%20Dashboard/Home_Page.html`)
- **Redirect URLs** (Add all of the following):
  ```
  http://localhost:3000/**
  http://localhost:3000/Web%20Dashboard/auth_callback.html
  http://localhost:3000/Web%20Dashboard/New%20Password%20Set.html
  http://localhost:3000/Web%20Dashboard/Login_Page.html
  https://timetaskbd.com/**
  https://timetaskbd.com/Web%20Dashboard/auth_callback.html
  https://timetaskbd.com/Web%20Dashboard/New%20Password%20Set.html
  ```

### 2.5 Google OAuth 2.0 Provider
1. Go to Google Cloud Console ([console.cloud.google.com](https://console.cloud.google.com)).
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set **Authorized redirect URIs** to your Supabase callback:
   ```
   https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback
   ```
4. Copy the **Client ID** and **Client Secret**.
5. In Supabase Dashboard, go to **Authentication** → **Providers** → **Google**:
   - Turn **Google Enabled** to **ON**.
   - Paste the **Client ID** and **Client Secret**.
   - Click **Save**.

---

## 3. Database Execution (`sql/01_schema.sql`)

1. Open the Supabase Dashboard.
2. Navigate to the **SQL Editor** tab on the left menu.
3. Open `sql/01_schema.sql` from this repository, copy its full content, paste it into the SQL editor, and click **Run**.
4. The script provisions:
   - `private` schema with `private.withdrawal_pins` for bcrypt PIN storage.
   - Public tables: `profiles`, `user_payment_methods`, `withdrawals`, `kyc_requests`, `tasks`, `user_active_tasks`, `task_submissions`, `orders`, `reviews`, `platform_stats`, `market_assets`, `referrals`.
   - Security Definer RPCs: `check_username_available`, `set_onboarding_step`, `complete_onboarding`, `set_withdrawal_pin`, `request_withdrawal`.
   - Column-level privileges (blocking users from updating `role`, `balance`, `status`, or `verification_status`).
   - RLS policies across every table.
   - Storage bucket `kyc-documents` and RLS policies.

---

## 4. Storage Bucket Setup

`sql/01_schema.sql` automatically configures the bucket, but verify in **Storage**:
1. Check that the bucket **`kyc-documents`** exists.
2. Confirm **Public bucket** is **OFF** (Private bucket).
3. Verify File Size Limit: **5 MB** (`5242880` bytes).
4. Verify Allowed MIME types: `image/jpeg, image/png, image/jpg`.
5. RLS policies ensure users can only upload and read files inside their own folder: `<user_id>/<filename>`.

---

## 5. Security Architecture Summary

| Concern | Implementation |
|---|---|
| **Role Escalation** | `handle_new_user()` trigger strictly normalizes metadata to `'USER'` or `'BUYER'`. Role cannot be set to `'ADMIN'` via client signup. |
| **Balance Tampering** | Column grants revoke `UPDATE` on `profiles.balance` from `authenticated`. Balances are only modified through atomic SQL RPCs with row-level locks (`FOR UPDATE`). |
| **Withdrawal PIN Safety** | Plaintext PINs are never stored in `profiles`. PINs are bcrypt-hashed inside `private.withdrawal_pins`. Wrong attempts are tracked; 5 failures trigger an automated 15-minute lockout. |
| **Role Isolation** | `requireAuth(role)` client guard routes users to their proper dashboard or onboarding step. Server-side RLS prevents cross-role reading of orders/submissions. |
| **Stored XSS** | Dynamic DOM injections on public pages (`Home_Page.html`) are escaped with `escapeHtml()`. |
| **Review Manipulation** | RLS requires `is_approved = FALSE` on client review inserts. Self-approving reviews is blocked. |
| **KYC Restrictions** | Partial index `idx_one_pending_kyc` restricts users to at most one pending verification at a time. |

---

## 6. HTML Bug Fixes Applied

The following bugs in the provided HTML files have been fixed:
1. **`Web Dashboard/Email Verifycation Page.html`**:
   - Fixed unclosed tag: `</footer  <!-- Supabase Logic -->` replaced with `</footer>  <!-- Supabase Logic -->`.
2. **`Web Dashboard/Register_Page.html`**:
   - Fixed username regex pattern: `pattern="[a-z0-9]+"` replaced with `pattern="[a-z0-9_]{3,12}"` so underscores and proper lengths are allowed.
3. **`User Dashboard/User_Index.html`**:
   - Fixed corrupted duplicated closing tags around lines 1681–1688.
   - Replaced insecure client-side PIN check and direct `withdrawals.insert()` with atomic server-side RPC `supabaseClient.rpc('request_withdrawal', ...)`.
   - Prevented client review self-approval: `is_approved: false` enforced.
4. **`Web Dashboard/Home_Page.html`**:
   - Added `escapeHtml()` sanitization across podium renders, live payouts, and reviews to neutralize stored XSS risks.
