/*
# Fix: Column-level protection on profiles role and status columns

## Overview
Users can UPDATE their own profile row via the Supabase Data API (RLS allows it).
The application prevents role/status changes in code, but the database does not
enforce column-level restrictions. This creates a privilege escalation risk where
a sophisticated user could escalate their own role via direct Data API calls.

## Fix
1. REVOKE the broad UPDATE on profiles from authenticated
2. GRANT UPDATE only on display_name (the only column users should modify)
3. Role and status changes can only happen via the service role (admin API route)

## Security Impact
Eliminates the vertical privilege escalation risk identified in THREATS.md T3.
Users can no longer self-escalate to admin via the Data API.
*/

REVOKE UPDATE ON profiles FROM authenticated;
GRANT UPDATE (display_name) ON profiles TO authenticated;
