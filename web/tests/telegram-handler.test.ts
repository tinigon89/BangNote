import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNote, getNote, listNotes } from '@/lib/notes/notes';
import { createTag, getDefaultTag } from '@/lib/notes/tags';
import type { TgUpdate } from '@/lib/telegram/types';
import { createTestDb, type TestDb } from './helpers/test-db';

vi.mock('@/lib/telegram/api', () => ({ callTelegram: vi.fn(async () => ({})) }));
import { callTelegram } from '@/lib/telegram/api';
import { handleUpdate } from '@/lib/telegram/handler';

const tg = vi.mocked(callTelegram);
const OWNER = 111;
const STRANGER = 999;
const config = { ownerId: String(OWNER) };

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(async () => {
  await t.reset();
  tg.mockReset();
  tg.mockResolvedValue({});
});
afterAll(() => t.close());

let updateId = 0;
function msg(text: string | undefined, from = OWNER, extra: Record<string, unknown> = {}): TgUpdate {
  return {
    update_id: ++updateId,
    message: { message_id: 50, chat: { id: from }, from: { id: from }, text, ...extra },
  };
}
function cb(data: string, from = OWNER): TgUpdate {
  return {
    update_id: ++updateId,
    callback_query: {
      id: 'cq1',
      from: { id: from },
      data,
      message: { message_id: 60, chat: { id: from } },
    },
  };
}
const calls = (method: string) => tg.mock.calls.filter(([m]) => m === method).map(([, p]) => p as Record<string, any>);

describe('tin nhắn', () => {
  it('/start trả user ID cho cả người lạ, không lưu gì', async () => {
    await handleUpdate(t.db, msg('/start', STRANGER), config);
    expect(calls('sendMessage')[0].text).toContain(`${STRANGER}`);
    expect(calls('sendMessage')[0].text).not.toContain('/recent');
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('/start của chủ có hướng dẫn', async () => {
    await handleUpdate(t.db, msg('/start'), config);
    expect(calls('sendMessage')[0].text).toContain('/recent');
  });

  it('người lạ gửi text → bỏ qua hoàn toàn', async () => {
    await handleUpdate(t.db, msg('xin chào', STRANGER), config);
    expect(tg).not.toHaveBeenCalled();
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('ownerId trống → không ai lưu được', async () => {
    await handleUpdate(t.db, msg('xin chào'), { ownerId: '' });
    expect((await listNotes(t.db)).notes).toHaveLength(0);
  });

  it('lưu text, gắn tag từ hashtag, trả lời kèm bàn phím', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await handleUpdate(t.db, msg('#LichSu Trận Bạch Đằng'), config);

    const [note] = (await listNotes(t.db)).notes;
    expect(note).toMatchObject({ content: 'Trận Bạch Đằng', source: 'telegram' });
    expect(note.tags.map((x) => x.name)).toEqual(['Lịch sử']);

    const reply = calls('sendMessage')[0];
    expect(reply.text).toBe('✅ Đã lưu — Lịch sử #1');
    expect(reply.chat_id).toBe(OWNER);
    expect(reply.reply_parameters).toMatchObject({ message_id: 50 });
    expect(reply.reply_markup.inline_keyboard[0][1]).toEqual({
      text: '✓ Lịch sử',
      callback_data: `t:${note.id}:${note.tags[0].id}`,
    });
  });

  it('báo hashtag lạ nhưng vẫn lưu', async () => {
    await handleUpdate(t.db, msg('ghi chú #xyz'), config);
    expect((await listNotes(t.db)).notes[0].content).toBe('ghi chú #xyz');
    expect(calls('sendMessage')[0].text).toContain('⚠️ Không có tag #xyz');
  });

  it('chỉ toàn hashtag → không lưu', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await handleUpdate(t.db, msg('#LichSu'), config);
    expect((await listNotes(t.db)).notes).toHaveLength(0);
    expect(calls('sendMessage')[0].text).toBe('Nội dung trống, không lưu');
  });

  it('ảnh không caption → "Chỉ hỗ trợ text"; có caption → lưu caption', async () => {
    await handleUpdate(t.db, msg(undefined, OWNER, { photo: [{}] }), config);
    expect(calls('sendMessage')[0].text).toBe('Chỉ hỗ trợ text');
    await handleUpdate(t.db, msg(undefined, OWNER, { caption: 'chú thích ảnh' }), config);
    expect((await listNotes(t.db)).notes[0].content).toBe('chú thích ảnh');
  });

  it('nội dung quá dài → báo lỗi, không ném', async () => {
    await handleUpdate(t.db, msg('a'.repeat(20001)), config);
    expect(calls('sendMessage')[0].text).toBe('❌ Nội dung tối đa 20000 ký tự');
  });

  it('/tags và /recent', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await createNote(t.db, { content: 'ghi chú đầu', source: 'web' });
    await handleUpdate(t.db, msg('/tags'), config);
    expect(calls('sendMessage')[0].text).toBe('• Chưa phân loại (1)\n• Lịch sử (0)');
    await handleUpdate(t.db, msg('/recent'), config);
    expect(calls('sendMessage')[1].text).toBe('Chưa phân loại #1\nghi chú đầu');
  });

  it('khớp nhiều hashtag → gắn tag đầu, cảnh báo chỉ 1 tag', async () => {
    await createTag(t.db, { name: 'Lịch sử' });
    await createTag(t.db, { name: 'Y học' });
    await handleUpdate(t.db, msg('#YHoc #LichSu nội dung'), config);
    const [note] = (await listNotes(t.db)).notes;
    expect(note.tags[0].name).toBe('Y học');
    expect(calls('sendMessage')[0].text).toBe('✅ Đã lưu — Y học #1\n⚠️ Chỉ gắn 1 tag: Y học');
  });

  it('lỗi bất ngờ khi lưu → nhắn "❌ Lỗi khi lưu" và không ném ra ngoài', async () => {
    tg.mockImplementationOnce(async () => {
      throw new Error('mạng lỗi');
    });
    await expect(handleUpdate(t.db, msg('xin chào'), config)).resolves.toBeUndefined();
    expect(calls('sendMessage').at(-1)?.text).toBe('❌ Lỗi khi lưu');
  });
});

describe('callback', () => {
  it('bấm tag khác → chuyển tag, sửa tin nhắn thành "Tag #n" kèm bàn phím mới', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config);

    expect((await getNote(t.db, note.id))!.tags.map((x) => x.name)).toEqual(['Lịch sử']);
    const edit = calls('editMessageText')[0];
    expect(edit).toMatchObject({ chat_id: OWNER, message_id: 60, text: '✅ Đã lưu — Lịch sử #1' });
    expect(edit.reply_markup.inline_keyboard[0][1].text).toBe('✓ Lịch sử');
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ callback_query_id: 'cq1', text: '→ Lịch sử #1' });
  });

  it('bấm tag hiện tại → không đổi gì', async () => {
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    const def = await getDefaultTag(t.db);
    await handleUpdate(t.db, cb(`t:${note.id}:${def.id}`), config);
    expect(calls('editMessageText')).toHaveLength(0);
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: 'Chưa phân loại #1' });
  });

  it('bấm nút của tag đã bị xoá → "Tag không còn", ghi chú giữ nguyên', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram', tagIds: [ls.id] });
    await t.pg.query('UPDATE notes SET tag_id = (SELECT id FROM tags WHERE is_default) WHERE id = $1', [note.id]);
    await t.pg.query('DELETE FROM tags WHERE id = $1', [ls.id]);
    await handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config);
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: 'Tag không còn' });
    const kb = calls('editMessageReplyMarkup')[0].reply_markup.inline_keyboard.flat().map((b: { text: string }) => b.text);
    expect(kb).not.toContain('Lịch sử');
    expect(kb).toContain('✓ Chưa phân loại');
    expect((await getNote(t.db, note.id))!.tags[0].name).toBe('Chưa phân loại');
  });

  it('"message is not modified" từ Telegram bị bỏ qua', async () => {
    const ls = await createTag(t.db, { name: 'Lịch sử' });
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    tg.mockImplementation(async (method: string) => {
      if (method === 'editMessageText') throw new Error('Telegram editMessageText: Bad Request: message is not modified');
      return {};
    });
    await expect(handleUpdate(t.db, cb(`t:${note.id}:${ls.id}`), config)).resolves.toBeUndefined();
    expect(calls('answerCallbackQuery')).toHaveLength(1);
  });

  it('xoá note', async () => {
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`d:${note.id}`), config);
    expect(await getNote(t.db, note.id)).toBeNull();
    expect(calls('editMessageText')[0]).toMatchObject({ message_id: 60, text: '🗑 Đã xoá' });
  });

  it('note không còn → trả lời "Ghi chú không còn"', async () => {
    await handleUpdate(t.db, cb('t:999:1'), config);
    expect(calls('answerCallbackQuery')[0]).toMatchObject({ text: 'Ghi chú không còn' });
  });

  it('người lạ bấm nút → không đổi gì', async () => {
    const note = await createNote(t.db, { content: 'x', source: 'telegram' });
    await handleUpdate(t.db, cb(`d:${note.id}`, STRANGER), config);
    expect(await getNote(t.db, note.id)).not.toBeNull();
  });
});
