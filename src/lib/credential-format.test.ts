import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePrivateKey } from './credential-format';
test('Firebase private key accepts escaped and actual line breaks', () => {
  const pem = ['-----BEGIN PRIVATE KEY-----', 'example', '-----END PRIVATE KEY-----', ''].join(String.fromCharCode(10));
  assert.equal(normalizePrivateKey(pem), pem);
  assert.equal(normalizePrivateKey(pem.replaceAll(String.fromCharCode(10), String.fromCharCode(92) + 'n')), pem);
  assert.equal(normalizePrivateKey(undefined), undefined);
});
