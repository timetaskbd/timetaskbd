
# Supabase Database Setup Guide

## Step 1: Apply the Schema to Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) and select your project
2. Navigate to **SQL Editor** → **New Query**
3. Copy and paste the entire content of `database/schema.sql`
4. Click **Run** to execute the query

## Step 2: Verify the Profiles Table

1. Go to **Table Editor** in your Supabase project
2. You should see a table called `profiles` with these columns:
   - `id` (UUID, primary key)
   - `role` (TEXT, check constraint for 'USER' or 'BUYER')
   - `full_name` (TEXT)
   - `username` (TEXT, unique)
   - `email` (TEXT)
   - `onboarding_completed` (BOOLEAN, default false)
   - `email_verified` (BOOLEAN, default false)
   - `onboarding_settings` (TEXT)
   - `created_at` (TIMESTAMPTZ)
   - `updated_at` (TIMESTAMPTZ)

## Step 3: Verify RLS Policies

In the **Table Editor**, click on the `profiles` table, then click on **RLS Policies** (the lock icon). You should see these policies:

1. Users can view their own profile
2. Users can update their own profile
3. Users can insert their own profile

## Step 4: Test the Flow

1. Go to your local app at http://localhost:3000/Web%20Dashboard/Register_Page.html
2. Open your browser's developer tools (F12) and go to the **Console** tab
3. Try registering a new account
4. If any database errors occur, they'll appear in both the console and on the page!
