import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentCredential } from '../src/auth/meta-auth.js';

test('reads the Meta provider credential from META_MODEL_API_KEY', () => {
  const previous = process.env.META_MODEL_API_KEY;
  try {
    process.env.META_MODEL_API_KEY = 'meta-key';
    assert.equal(environmentCredential(), 'meta-key');
  } finally {
    if (previous === undefined) delete process.env.META_MODEL_API_KEY; else process.env.META_MODEL_API_KEY = previous;
  }
});
