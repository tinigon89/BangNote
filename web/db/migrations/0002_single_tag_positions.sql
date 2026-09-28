ALTER TABLE notes ADD COLUMN tag_id integer REFERENCES tags(id);
ALTER TABLE notes ADD COLUMN position integer;

UPDATE notes n SET tag_id = COALESCE(
  (SELECT t.id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = n.id AND NOT t.is_default
    ORDER BY t.name, t.id LIMIT 1),
  (SELECT id FROM tags WHERE is_default)
);

UPDATE notes n SET position = r.rn
FROM (SELECT id, row_number() OVER (PARTITION BY tag_id ORDER BY created_at, id) AS rn FROM notes) r
WHERE r.id = n.id;

ALTER TABLE notes ALTER COLUMN tag_id SET NOT NULL;
ALTER TABLE notes ALTER COLUMN position SET NOT NULL;
CREATE INDEX notes_tag_position ON notes (tag_id, position);

DROP TABLE note_tags;
