import assert from 'node:assert/strict';
import test from 'node:test';
import { environmentCredential } from '../src/auth/meta-auth.js';

test('META_MODEL_API_KEY has highest environment precedence', () => {
  const previous = {
    meta: process.env.META_MODEL_API_KEY,
    muse: process.env.MUSE_API_KEY,
    llama: process.env.LLAMA_API_KEY,
  };
  try {
    process.env.META_MODEL_API_KEY = 'meta-key';
    process.env.MUSE_API_KEY = 'muse-key';
    process.env.LLAMA_API_KEY = 'llama-key';
    assert.equal(environmentCredential(), 'meta-key');
  } finally {
    if (previous.meta === undefined) delete process.env.META_MODEL_API_KEY; else process.env.META_MODEL_API_KEY = previous.meta;
    if (previous.muse === undefined) delete process.env.MUSE_API_KEY; else process.env.MUSE_API_KEY = previous.muse;
    if (previous.llama === undefined) delete process.env.LLAMA_API_KEY; else process.env.LLAMA_API_KEY = previous.llama;
  }
});
