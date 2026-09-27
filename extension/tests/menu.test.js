import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMenuItems, parseMenuId } from '../lib/menu.js';

const TAGS = [
  { id: 1, name: 'Chưa phân loại', isDefault: true },
  { id: 2, name: 'Lịch sử', isDefault: false },
  { id: 3, name: 'Văn & Sử', isDefault: false },
];

test('chưa cấu hình → chỉ mục mở cài đặt', () => {
  assert.deepEqual(buildMenuItems({ configured: false, tags: TAGS }), [
    { id: 'bn-setup', title: 'BangNote: mở cài đặt', contexts: ['selection'] },
  ]);
});

test('đã cấu hình → menu cha, tag, phân cách, làm mới; escape &', () => {
  const items = buildMenuItems({ configured: true, tags: TAGS });
  assert.deepEqual(
    items.map((i) => [i.id, i.title ?? i.type, i.parentId]),
    [
      ['bn-root', 'Gửi tới BangNote', undefined],
      ['bn-tag-default', 'Chưa phân loại', 'bn-root'],
      ['bn-tag-2', 'Lịch sử', 'bn-root'],
      ['bn-tag-3', 'Văn && Sử', 'bn-root'],
      ['bn-sep', 'separator', 'bn-root'],
      ['bn-refresh', '↻ Làm mới danh sách tag', 'bn-root'],
    ],
  );
  for (const item of items) assert.deepEqual(item.contexts, ['selection']);
});

test('không có tag (tải lỗi) → vẫn có mục mặc định', () => {
  const ids = buildMenuItems({ configured: true, tags: [] }).map((i) => i.id);
  assert.deepEqual(ids, ['bn-root', 'bn-tag-default', 'bn-sep', 'bn-refresh']);
});

test('parseMenuId', () => {
  assert.deepEqual(parseMenuId('bn-tag-default'), { kind: 'save', tagIds: [] });
  assert.deepEqual(parseMenuId('bn-tag-12'), { kind: 'save', tagIds: [12] });
  assert.deepEqual(parseMenuId('bn-refresh'), { kind: 'refresh' });
  assert.deepEqual(parseMenuId('bn-setup'), { kind: 'setup' });
  assert.equal(parseMenuId('bn-root'), null);
  assert.equal(parseMenuId('other'), null);
});
