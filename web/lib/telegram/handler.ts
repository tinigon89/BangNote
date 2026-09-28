import type { DB } from '@/lib/db/types';
import { DomainError } from '@/lib/notes/errors';
import { createNote, deleteNotes, getNote, listNotes } from '@/lib/notes/notes';
import { listTags, listTagsWithCounts, moveNote } from '@/lib/notes/tags';
import { callTelegram } from './api';
import { extractHashtags } from './hashtags';
import { buildNoteKeyboard, parseCallbackData, savedLabel } from './keyboard';
import type { TgCallbackQuery, TgMessage, TgUpdate } from './types';

export interface BotConfig {
  ownerId: string;
}

const isCommand = (text: string, name: string) => new RegExp(`^/${name}(@\\w+)?(\\s|$)`).test(text);
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export async function handleUpdate(db: DB, update: TgUpdate, config: BotConfig): Promise<void> {
  if (update.message) await handleMessage(db, update.message, config);
  else if (update.callback_query) await handleCallback(db, update.callback_query, config);
}

async function handleMessage(db: DB, msg: TgMessage, config: BotConfig): Promise<void> {
  const fromId = String(msg.from?.id ?? '');
  const text = msg.text ?? msg.caption ?? '';
  const reply = (body: string, extra: Record<string, unknown> = {}) =>
    callTelegram('sendMessage', {
      chat_id: msg.chat.id,
      text: body,
      reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true },
      ...extra,
    });

  if (isCommand(text, 'start')) {
    const help =
      fromId === config.ownerId
        ? '\n\nGửi bất kỳ đoạn text nào để lưu vào BangNote. Thêm #TenTag để gắn tag.\n/tags – danh sách tag\n/recent – 5 ghi chú mới nhất'
        : '';
    await reply(`Telegram user ID của bạn: ${fromId}${help}`);
    return;
  }
  if (!config.ownerId || fromId !== config.ownerId) return;

  try {
    if (isCommand(text, 'tags')) {
      const tags = await listTagsWithCounts(db);
      await reply(tags.map((tag) => `• ${tag.name} (${tag.noteCount})`).join('\n'));
      return;
    }
    if (isCommand(text, 'recent')) {
      const { notes } = await listNotes(db, { limit: 5 });
      const body = notes
        .map((n) => `${savedLabel(n.tags[0].name, n.position)}\n${truncate(n.content, 200)}`)
        .join('\n\n');
      await reply(body || 'Chưa có ghi chú nào');
      return;
    }
    if (!text.trim()) {
      await reply('Chỉ hỗ trợ text');
      return;
    }

    const allTags = await listTags(db);
    const { content, tagIds, unknown } = extractHashtags(text, allTags);
    if (!content) {
      await reply('Nội dung trống, không lưu');
      return;
    }
    const note = await createNote(db, { content, source: 'telegram', tagIds });
    const warnings = [
      ...(tagIds.length > 1 ? [`⚠️ Chỉ gắn 1 tag: ${note.tags[0].name}`] : []),
      ...(unknown.length ? [`⚠️ Không có tag ${unknown.join(', ')}`] : []),
    ];
    await reply([`✅ Đã lưu — ${savedLabel(note.tags[0].name, note.position)}`, ...warnings].join('\n'), {
      reply_markup: buildNoteKeyboard(note.id, allTags, [note.tags[0].id]),
    });
  } catch (err) {
    if (err instanceof DomainError) {
      await reply(`❌ ${err.message}`);
      return;
    }
    console.error('telegram message failed', err);
    await reply('❌ Lỗi khi lưu').catch(() => undefined);
  }
}

async function handleCallback(db: DB, cq: TgCallbackQuery, config: BotConfig): Promise<void> {
  const answer = (text?: string) =>
    callTelegram('answerCallbackQuery', { callback_query_id: cq.id, ...(text ? { text } : {}) });

  if (!config.ownerId || String(cq.from.id) !== config.ownerId) {
    await answer();
    return;
  }
  const action = parseCallbackData(cq.data ?? '');
  const msg = cq.message;
  if (!action || !msg) {
    await answer();
    return;
  }
  const note = await getNote(db, action.noteId);
  if (!note) {
    await answer('Ghi chú không còn');
    return;
  }

  if (action.kind === 'delete') {
    await deleteNotes(db, [note.id]);
    await callTelegram('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: '🗑 Đã xoá',
    });
    await answer('Đã xoá');
    return;
  }

  const current = note.tags[0];
  if (action.tagId === current.id) {
    await answer(savedLabel(current.name, note.position));
    return;
  }
  const allTags = await listTags(db);
  if (!allTags.some((tag) => tag.id === action.tagId)) {
    // Bàn phím cũ còn nút của tag đã xoá → vẽ lại theo danh sách tag hiện tại
    try {
      await callTelegram('editMessageReplyMarkup', {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: buildNoteKeyboard(note.id, allTags, [current.id]),
      });
    } catch (err) {
      if (!(err instanceof Error && err.message.includes('message is not modified'))) throw err;
    }
    await answer('Tag không còn');
    return;
  }
  const { tag, position } = await moveNote(db, note.id, action.tagId);
  try {
    await callTelegram('editMessageText', {
      chat_id: msg.chat.id,
      message_id: msg.message_id,
      text: `✅ Đã lưu — ${savedLabel(tag.name, position)}`,
      reply_markup: buildNoteKeyboard(note.id, allTags, [tag.id]),
    });
  } catch (err) {
    if (!(err instanceof Error && err.message.includes('message is not modified'))) throw err;
  }
  await answer(`→ ${savedLabel(tag.name, position)}`);
}
