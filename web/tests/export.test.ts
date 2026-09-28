import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildNotesDocx } from '@/lib/export/docx';
import { exportFilename, formatNotesTxt, joinForCopy, noteHeader } from '@/lib/export/text';
import type { Note, Tag } from '@/lib/notes/types';

const LS: Tag = { id: 2, name: 'Lịch sử', color: '#ef4444', isDefault: false };
const YH: Tag = { id: 3, name: 'Y học', color: '#22c55e', isDefault: false };
const n1: Note = {
  id: 12,
  content: 'Trận Bạch Đằng\nnăm 938',
  source: 'extension',
  sourceUrl: 'https://vi.wikipedia.org/x',
  sourceTitle: 'Wiki',
  createdAt: new Date('2026-09-27T07:05:00Z'), // 14:05 giờ VN
  updatedAt: new Date('2026-09-27T07:05:00Z'),
  tags: [LS, YH],
  position: 3,
  sub: 0,
};
const n2: Note = { ...n1, id: 13, content: 'Hải Thượng Lãn Ông', sourceUrl: null, sourceTitle: null, tags: [YH] };

describe('text export', () => {
  it('comment hiện dạng #bài.comment', () => {
    expect(noteHeader({ ...n1, position: 5, sub: 2 }, { number: true, detail: false })).toBe('#5.2');
  });

  it('dòng đầu theo tuỳ chọn: số # là số trong tag, không có số id', () => {
    expect(noteHeader(n1)).toBe('#3 · Lịch sử, Y học · 27/09/2026 14:05 · https://vi.wikipedia.org/x');
    expect(noteHeader(n1, { number: true, detail: false })).toBe('#3');
    expect(noteHeader(n1, { number: false, detail: true })).toBe('Lịch sử, Y học · 27/09/2026 14:05 · https://vi.wikipedia.org/x');
    expect(noteHeader(n1, { number: false, detail: false })).toBe('');
  });

  it('TXT: ghi chú cách nhau đúng một dòng trống, không còn đường kẻ', () => {
    expect(formatNotesTxt([n1, n2], { number: true, detail: false })).toBe('#3\nTrận Bạch Đằng\nnăm 938\n\n#3\nHải Thượng Lãn Ông\n');
    expect(formatNotesTxt([n1, n2], { number: false, detail: false })).toBe('Trận Bạch Đằng\nnăm 938\n\nHải Thượng Lãn Ông\n');
    expect(formatNotesTxt([n1, n2])).not.toContain('---');
    expect(formatNotesTxt([])).toBe('');
  });

  it('copy: chỉ nội dung, cách nhau một dòng trống', () => {
    expect(joinForCopy([n1, n2])).toBe('Trận Bạch Đằng\nnăm 938\n\nHải Thượng Lãn Ông');
  });

  it('tên file theo ngày VN', () => {
    expect(exportFilename('docx', new Date('2026-09-27T17:30:00Z'))).toBe('bangnote-2026-09-28.docx');
  });
});

describe('docx export', () => {
  it('tạo file .docx hợp lệ chứa dòng đầu và từng dòng nội dung', async () => {
    const buf = await buildNotesDocx([n1, n2]);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    for (const text of ['#3 · Lịch sử, Y học · 27/09/2026 14:05', 'Trận Bạch Đằng', 'năm 938', 'Hải Thượng Lãn Ông']) {
      expect(xml).toContain(text);
    }
  });

  it('Word: theo tuỳ chọn, không kẻ viền giữa ghi chú', async () => {
    const xmlOf = async (buf: Buffer) => (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string');
    const full = await xmlOf(await buildNotesDocx([n1, n2]));
    expect(full).toContain('#3 · Lịch sử, Y học');
    expect(full).not.toContain('w:pBdr');
    const bare = await xmlOf(await buildNotesDocx([n1], { number: false, detail: false }));
    expect(bare).not.toContain('#3');
    expect(bare).not.toContain('Lịch sử');
    expect(bare).toContain('Trận Bạch Đằng');
  });

  it('không có ghi chú → vẫn là file hợp lệ', async () => {
    const buf = await buildNotesDocx([]);
    expect(await (await JSZip.loadAsync(buf)).file('word/document.xml')!.async('string')).toContain('Không có ghi chú');
  });
});
