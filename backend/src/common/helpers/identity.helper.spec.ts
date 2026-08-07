import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLoginIdentifierKind, normalizeEmail, normalizeVietnamPhone } from './identity.helper';

test('normalizes staff email case and surrounding whitespace', () => {
  assert.equal(normalizeEmail('  Admin@Example.com  '), 'admin@example.com');
  assert.equal(detectLoginIdentifierKind(' Admin@MokaSolar.com '), 'EMAIL');
});

test('keeps customer Vietnamese phone normalization unchanged', () => {
  assert.equal(normalizeVietnamPhone('0912 345 678'), '84912345678');
  assert.equal(normalizeVietnamPhone('+84 912 345 678'), '84912345678');
});
