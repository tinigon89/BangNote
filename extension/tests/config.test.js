import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeServerUrl, originPattern } from '../lib/config.js';

test('bỏ dấu / cuối và giữ path', () => {
  assert.equal(normalizeServerUrl(' https://bangnote.vercel.app/ '), 'https://bangnote.vercel.app');
  assert.equal(normalizeServerUrl('https://a.b/sub///'), 'https://a.b/sub');
  assert.equal(normalizeServerUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('bỏ query và hash', () => {
  assert.equal(normalizeServerUrl('https://a.b/?x=1#y'), 'https://a.b');
});

test('từ chối URL thiếu scheme hoặc scheme lạ', () => {
  assert.throws(() => normalizeServerUrl('bangnote.vercel.app'), /URL/);
  assert.throws(() => normalizeServerUrl('ftp://a.b'), /http/);
  assert.throws(() => normalizeServerUrl(''), /URL/);
});

test('originPattern', () => {
  assert.equal(originPattern('https://a.b/sub'), 'https://a.b/*');
});
