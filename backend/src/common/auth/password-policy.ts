export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const KNOWN_WEAK_PASSWORDS = new Set([
  '123456789012',
  'adminadmin12',
  'changeme1234',
  'password1234',
  'qwertyuiop12',
]);

export function getPasswordPolicyIssues(password: string) {
  const issues: string[] = [];
  const value = String(password ?? '');

  if (value.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Password must contain at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (value.length > PASSWORD_MAX_LENGTH) {
    issues.push(`Password must contain at most ${PASSWORD_MAX_LENGTH} characters.`);
  }

  if (/[\u0000-\u001f\u007f]/.test(value)) {
    issues.push('Password must not contain control characters.');
  }

  if (KNOWN_WEAK_PASSWORDS.has(value.toLowerCase())) {
    issues.push('Password is too common. Choose a longer passphrase.');
  }

  return issues;
}

export function assertPasswordPolicy(password: string) {
  const issues = getPasswordPolicyIssues(password);
  if (issues.length) {
    throw new Error(issues[0]);
  }
}
