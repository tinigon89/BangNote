const ROOT = 'bn-root';
const CONTEXTS = ['selection'];

/** Chrome dùng `&` làm phím tắt menu; `&&` hiển thị thành `&`. */
const escapeTitle = (s) => s.replace(/&/g, '&&');

export function buildMenuItems({ configured, tags }) {
  if (!configured) return [{ id: 'bn-setup', title: 'BangNote: mở cài đặt', contexts: CONTEXTS }];

  const tagItems = tags.length
    ? tags.map((tag) => ({
        id: tag.isDefault ? 'bn-tag-default' : `bn-tag-${tag.id}`,
        parentId: ROOT,
        title: escapeTitle(tag.name),
        contexts: CONTEXTS,
      }))
    : [{ id: 'bn-tag-default', parentId: ROOT, title: 'Chưa phân loại', contexts: CONTEXTS }];

  return [
    { id: ROOT, title: 'Gửi tới BangNote', contexts: CONTEXTS },
    ...tagItems,
    { id: 'bn-sep', parentId: ROOT, type: 'separator', contexts: CONTEXTS },
    { id: 'bn-refresh', parentId: ROOT, title: '↻ Làm mới danh sách tag', contexts: CONTEXTS },
  ];
}

export function parseMenuId(id) {
  if (id === 'bn-setup') return { kind: 'setup' };
  if (id === 'bn-refresh') return { kind: 'refresh' };
  if (id === 'bn-tag-default') return { kind: 'save', tagIds: [] };
  const match = /^bn-tag-(\d+)$/.exec(id);
  return match ? { kind: 'save', tagIds: [Number(match[1])] } : null;
}
