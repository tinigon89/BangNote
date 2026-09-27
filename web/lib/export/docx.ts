import { BorderStyle, Document, Packer, Paragraph, TextRun } from 'docx';
import type { Note } from '@/lib/notes/types';
import { noteHeader } from './text';

function noteParagraphs(note: Note, isLast: boolean, detailed: boolean): Paragraph[] {
  const lines = note.content.split(/\r?\n/);
  return [
    new Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new TextRun({ text: noteHeader(note, detailed), size: 18, color: '64748B' })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      border: isLast ? undefined : { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 8 } },
      children: lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })),
    }),
  ];
}

export async function buildNotesDocx(notes: Note[], detailed = true): Promise<Buffer> {
  const children = notes.length
    ? notes.flatMap((note, i) => noteParagraphs(note, i === notes.length - 1, detailed))
    : [new Paragraph({ children: [new TextRun('Không có ghi chú nào.')] })];
  const doc = new Document({
    creator: 'BangNote',
    title: 'BangNote',
    styles: { default: { document: { run: { font: 'Calibri', size: 24 } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
