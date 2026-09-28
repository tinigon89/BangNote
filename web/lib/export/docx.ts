import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { Note } from '@/lib/notes/types';
import { FULL_EXPORT, noteHeader, type ExportOptions } from './text';

function noteParagraphs(note: Note, opts: ExportOptions): Paragraph[] {
  const header = noteHeader(note, opts);
  const lines = note.content.split(/\r?\n/);
  return [
    ...(header
      ? [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: header, size: 18, color: '64748B' })] })]
      : []),
    // after: 240 ≈ một dòng trống giữa các ghi chú
    new Paragraph({
      spacing: { after: 240 },
      children: lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })),
    }),
  ];
}

export async function buildNotesDocx(notes: Note[], opts: ExportOptions = FULL_EXPORT): Promise<Buffer> {
  const children = notes.length
    ? notes.flatMap((note) => noteParagraphs(note, opts))
    : [new Paragraph({ children: [new TextRun('Không có ghi chú nào.')] })];
  const doc = new Document({
    creator: 'BangNote',
    title: 'BangNote',
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
