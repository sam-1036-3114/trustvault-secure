import { describe, it, expect } from 'vitest';
import { profileLoadMessage } from '../lib/profile-error';

describe('Profile loading diagnostics', () => {
  it.each(['PGRST205', '42P01'])('identifies missing schema for %s', code => {
    expect(profileLoadMessage({ code }, false)).toContain('finish setting up the account database');
  });
  it('distinguishes a missing profile from missing schema', () => {
    expect(profileLoadMessage(null, false)).toContain('restore your profile');
  });
  it('identifies blocked permissions', () => {
    expect(profileLoadMessage({ code: '42501' }, false)).toContain('database permissions');
  });
  it('does not allow a query failure to look successful', () => {
    expect(profileLoadMessage({ code: 'OTHER' }, true)).toContain('could not be loaded');
  });
  it('accepts a loaded profile', () => {
    expect(profileLoadMessage(null, true)).toBeNull();
  });
});
