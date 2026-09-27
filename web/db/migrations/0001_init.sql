CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE TABLE tags (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tags_single_default ON tags (is_default) WHERE is_default;

CREATE TABLE notes (
  id serial PRIMARY KEY,
  content text NOT NULL,
  source text NOT NULL CHECK (source IN ('telegram', 'extension', 'widget', 'web')),
  source_url text,
  source_title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE note_tags (
  note_id integer NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id integer NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);
CREATE INDEX note_tags_tag_id ON note_tags (tag_id);

INSERT INTO tags (name, color, is_default) VALUES ('Chưa phân loại', '#94a3b8', true);
