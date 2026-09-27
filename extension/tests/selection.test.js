import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickText } from '../lib/selection.js';

test('ưu tiên text đọc từ trang (giữ xuống dòng)', () => {
  assert.equal(pickText('dòng 1\ndòng 2', 'dòng 1 dòng 2'), 'dòng 1\ndòng 2');
});

test('script lỗi / rỗng / không phải chuỗi → dùng selectionText', () => {
  assert.equal(pickText(undefined, 'fallback'), 'fallback');
  assert.equal(pickText('   ', 'fallback'), 'fallback');
  assert.equal(pickText(42, 'fallback'), 'fallback');
});

test('không có gì → chuỗi rỗng', () => {
  assert.equal(pickText(undefined, undefined), '');
});
