import type { Tag } from '@/lib/notes/types';
import { normalizeKey } from '@/lib/text/normalize';

export interface HashtagResult {
  content: string;
  tagIds: number[];
  unknown: string[];
}

const HASHTAG = /(^|\s)#([\p{L}\p{N}_]+)/gu;

export function extractHashtags(text: string, tags: Tag[]): HashtagResult {
  const byKey = new Map(tags.map((tag) => [normalizeKey(tag.name), tag]));
  const tagIds: number[] = [];
  const unknown: string[] = [];
  let removed = false;

  const stripped = text.replace(HASHTAG, (whole: string, prefix: string, word: string) => {
    const tag = byKey.get(normalizeKey(word));
    if (!tag) {
      if (!unknown.includes(`#${word}`)) unknown.push(`#${word}`);
      return whole;
    }
    if (!tagIds.includes(tag.id)) tagIds.push(tag.id);
    removed = true;
    return prefix;
  });

  const content = removed
    ? stripped
        .split('\n')
        .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
        .join('\n')
        .trim()
    : text.trim();

  return { content, tagIds, unknown };
}
