// Use stable database error codes; never render raw database messages or details.
export function profileLoadMessage(error: { code?: string } | null, hasProfile: boolean): string | null {
  if (error?.code === 'PGRST205' || error?.code === '42P01') {
    return 'Account setup is incomplete. The site administrator needs to finish setting up the account database before you can open your dashboard.';
  }
  if (error?.code === '42501') {
    return 'Your account profile is blocked by database permissions. Ask the site administrator to check account access, then retry.';
  }
  if (error) return 'Your account profile could not be loaded. Retry, or contact your administrator.';
  if (!hasProfile) return 'Your sign-in succeeded, but your account profile is missing. Ask the site administrator to restore your profile, then retry.';
  return null;
}
