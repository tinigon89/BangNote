ALTER TABLE notes ADD COLUMN sub integer NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS notes_tag_position;
CREATE INDEX notes_tag_position ON notes (tag_id, position, sub);
