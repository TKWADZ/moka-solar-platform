import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PASSWORD_MAX_LENGTH,
  assertPasswordPolicy,
  getPasswordPolicyIssues,
} from './password-policy';

test('accepts long passphrases without arbitrary character-category rules', () => {
  assert.doesNotThrow(() => assertPasswordPolicy('mot passphrase dai va an toan'));
});

test('rejects short, common and excessively long passwords', () => {
  assert.ok(getPasswordPolicyIssues('short').length > 0);
  assert.ok(getPasswordPolicyIssues('password1234').length > 0);
  assert.ok(getPasswordPolicyIssues('x'.repeat(PASSWORD_MAX_LENGTH + 1)).length > 0);
});

test('rejects control characters', () => {
  assert.ok(getPasswordPolicyIssues('valid-length\npassword').length > 0);
});
