import { boolean, integer, pgTable, primaryKey, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const SOURCES = ['telegram', 'extension', 'widget', 'web'] as const;
export type Source = (typeof SOURCES)[number];

export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  content: text('content').notNull(),
  source: text('source', { enum: SOURCES }).notNull(),
  sourceUrl: text('source_url'),
  sourceTitle: text('source_title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const noteTags = pgTable(
  'note_tags',
  {
    noteId: integer('note_id').notNull().references(() => notes.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.noteId, t.tagId] })],
);
