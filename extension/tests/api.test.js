import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError, createNote, fetchTags } from '../lib/api.js';

const config = { serverUrl: 'https://a.b', apiKey: 'k1' };

function fake(status, body, calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  };
}

test('fetchTags gửi Bearer và trả JSON', async () => {
  const calls = [];
  const tags = await fetchTags(config, fake(200, [{ id: 1, name: 'Chưa phân loại', isDefault: true }], calls));
  assert.equal(tags[0].name, 'Chưa phân loại');
  assert.equal(calls[0].url, 'https://a.b/api/tags');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.authorization, 'Bearer k1');
  assert.equal(calls[0].init.body, undefined);
});

test('createNote POST JSON', async () => {
  const calls = [];
  const note = { content: 'x', source: 'extension', tagIds: [2], sourceUrl: 'https://w', sourceTitle: 'W' };
  const res = await createNote(config, note, fake(201, { id: 7 }, calls));
  assert.equal(res.id, 7);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body), note);
});

test('lỗi có body {error} → ApiError với thông điệp server', async () => {
  await assert.rejects(fetchTags(config, fake(401, { error: 'API key không hợp lệ' })), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 401);
    assert.equal(err.message, 'API key không hợp lệ');
    return true;
  });
});

test('lỗi body HTML → "Lỗi <status>"', async () => {
  await assert.rejects(fetchTags(config, fake(404, '<html>Not found</html>')), { status: 404, message: 'Lỗi 404' });
});

test('mất mạng → status 0, thông điệp dễ hiểu', async () => {
  const offline = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(fetchTags(config, offline), { status: 0, message: 'Không kết nối được server' });
});
