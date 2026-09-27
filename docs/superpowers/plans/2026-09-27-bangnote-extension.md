# BangNote Extension (Chrome/Edge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extension Manifest V3 cho Chrome/Edge: bôi đen chữ → chuột phải → *Gửi tới BangNote* → chọn tag → lưu qua API; phím tắt `Alt+Shift+S` lưu vào tag mặc định.

**Architecture:** Logic thuần (chuẩn hoá URL, gọi API, dựng menu, chọn text) nằm trong `extension/lib/*.js` — ES module không phụ thuộc `chrome.*`, test bằng `node:test`. `background.js` (service worker) và `options.js` chỉ nối các hàm đó với `chrome.*`. Không có bước build.

**Tech Stack:** JavaScript ES2022 module, Chrome Extensions MV3 (`contextMenus`, `scripting`, `storage`, `alarms`, `notifications`, `commands`), Node 22 `node:test` cho unit test.

**Spec:** `docs/superpowers/specs/2026-09-27-bangnote-design.md` (§7). Hợp đồng API: §4.1.

**Phụ thuộc:** Plan Web (`docs/superpowers/plans/2026-09-27-bangnote-web.md`) phải xong Task 5 (REST API) trước khi test tay end-to-end; unit test chạy độc lập.

## Global Constraints

- Mọi lệnh `npm` chạy trong `extension/`. Không có dependency npm nào (chỉ `node:test`, `node:assert`, `node:zlib`, `node:fs`).
- API: `GET /api/tags` → `[{id, name, color, isDefault}]`; `POST /api/notes` body `{content, source: 'extension', tagIds, sourceUrl, sourceTitle}` → `201`; header `Authorization: Bearer <apiKey>`; lỗi → `{error: string}`.
- Lưu vào tag mặc định = gửi `tagIds: []` (server tự gắn "Chưa phân loại").
- Quyền: `contextMenus`, `storage`, `scripting`, `activeTab`, `alarms`, `notifications`; `optional_host_permissions: ["https://*/*", "http://*/*"]`, xin đúng origin server ở trang Tuỳ chọn.
- `chrome.permissions.request` phải là lệnh `await` **đầu tiên** trong handler click (giữ user gesture).
- Chuỗi hiển thị bằng tiếng Việt.

## Review Focus

1. **Trang không cho chạy script** (trình xem PDF, `chrome://`, Chrome Web Store) → `executeScript` lỗi → dùng `info.selectionText` — test `pickText` ở Task 1.
2. **URL server nhập có `/` cuối, có path, thiếu `https://`** → chuẩn hoá hoặc báo lỗi rõ — test ở Task 1.
3. **Server trả HTML (404 của Vercel) hoặc mất mạng** → thông báo đọc được ("Lỗi 404", "Không kết nối được server"), không phải "Unexpected token <" — test ở Task 1.
4. **Không tải được danh sách tag khi dựng menu** → menu vẫn có "Chưa phân loại" và "Làm mới" — test ở Task 1.
5. **Tên tag chứa `&`** ("Văn & Sử") → Chrome coi `&` là phím tắt menu và nuốt ký tự; phải escape thành `&&` — test ở Task 1.

---

## File Structure

```
extension/
  manifest.json
  background.js          service worker: menu, click, phím tắt, badge, notification
  options.html           trang Tuỳ chọn
  options.js
  lib/config.js          normalizeServerUrl, originPattern
  lib/api.js             ApiError, apiRequest, fetchTags, createNote
  lib/menu.js            buildMenuItems, parseMenuId
  lib/selection.js       pickText
  lib/storage.js         loadConfig, saveConfig, loadCachedTags, saveCachedTags (chrome.storage)
  icons/icon16.png icon32.png icon48.png icon128.png   (sinh bởi tools/make-icons.mjs)
  tools/make-icons.mjs
  package.json
  tests/config.test.js api.test.js menu.test.js selection.test.js
```

---

### Task 1: Thư viện thuần + unit test

**Files:**
- Create: `extension/package.json`, `extension/lib/config.js`, `extension/lib/api.js`, `extension/lib/menu.js`, `extension/lib/selection.js`
- Test: `extension/tests/config.test.js`, `extension/tests/api.test.js`, `extension/tests/menu.test.js`, `extension/tests/selection.test.js`

**Interfaces:**
- Produces:
  - `normalizeServerUrl(input: string): string` — trả `origin + path` không có `/` cuối; ném `Error` tiếng Việt nếu không phải http/https.
  - `originPattern(serverUrl: string): string` — `https://host/*`.
  - `class ApiError extends Error { status: number }` (`status = 0` khi lỗi mạng).
  - `apiRequest(config, method, path, body?, fetchImpl?)`, `fetchTags(config, fetchImpl?)`, `createNote(config, note, fetchImpl?)` — `config = { serverUrl, apiKey }`.
  - `buildMenuItems({ configured: boolean, tags: Tag[] }): chrome.contextMenus.CreateProperties[]`
  - `parseMenuId(id: string): { kind: 'save', tagIds: number[] } | { kind: 'refresh' } | { kind: 'setup' } | null`
  - Menu id: `bn-root`, `bn-tag-default`, `bn-tag-<id>`, `bn-sep`, `bn-refresh`, `bn-setup`.
  - `pickText(scripted: unknown, fallback: string | undefined): string`

- [ ] **Step 1: package.json**

`extension/package.json`:
```json
{
  "name": "bangnote-extension",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test \"tests/*.test.js\"",
    "icons": "node tools/make-icons.mjs"
  }
}
```

- [ ] **Step 2: Viết test thất bại**

`extension/tests/config.test.js`:
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeServerUrl, originPattern } from '../lib/config.js';

test('bỏ dấu / cuối và giữ path', () => {
  assert.equal(normalizeServerUrl(' https://bangnote.vercel.app/ '), 'https://bangnote.vercel.app');
  assert.equal(normalizeServerUrl('https://a.b/sub///'), 'https://a.b/sub');
  assert.equal(normalizeServerUrl('http://localhost:3000'), 'http://localhost:3000');
});

test('bỏ query và hash', () => {
  assert.equal(normalizeServerUrl('https://a.b/?x=1#y'), 'https://a.b');
});

test('từ chối URL thiếu scheme hoặc scheme lạ', () => {
  assert.throws(() => normalizeServerUrl('bangnote.vercel.app'), /URL/);
  assert.throws(() => normalizeServerUrl('ftp://a.b'), /http/);
  assert.throws(() => normalizeServerUrl(''), /URL/);
});

test('originPattern', () => {
  assert.equal(originPattern('https://a.b/sub'), 'https://a.b/*');
});
```

`extension/tests/api.test.js`:
```js
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
```

`extension/tests/menu.test.js`:
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMenuItems, parseMenuId } from '../lib/menu.js';

const TAGS = [
  { id: 1, name: 'Chưa phân loại', isDefault: true },
  { id: 2, name: 'Lịch sử', isDefault: false },
  { id: 3, name: 'Văn & Sử', isDefault: false },
];

test('chưa cấu hình → chỉ mục mở cài đặt', () => {
  assert.deepEqual(buildMenuItems({ configured: false, tags: TAGS }), [
    { id: 'bn-setup', title: 'BangNote: mở cài đặt', contexts: ['selection'] },
  ]);
});

test('đã cấu hình → menu cha, tag, phân cách, làm mới; escape &', () => {
  const items = buildMenuItems({ configured: true, tags: TAGS });
  assert.deepEqual(
    items.map((i) => [i.id, i.title ?? i.type, i.parentId]),
    [
      ['bn-root', 'Gửi tới BangNote', undefined],
      ['bn-tag-default', 'Chưa phân loại', 'bn-root'],
      ['bn-tag-2', 'Lịch sử', 'bn-root'],
      ['bn-tag-3', 'Văn && Sử', 'bn-root'],
      ['bn-sep', 'separator', 'bn-root'],
      ['bn-refresh', '↻ Làm mới danh sách tag', 'bn-root'],
    ],
  );
  for (const item of items) assert.deepEqual(item.contexts, ['selection']);
});

test('không có tag (tải lỗi) → vẫn có mục mặc định', () => {
  const ids = buildMenuItems({ configured: true, tags: [] }).map((i) => i.id);
  assert.deepEqual(ids, ['bn-root', 'bn-tag-default', 'bn-sep', 'bn-refresh']);
});

test('parseMenuId', () => {
  assert.deepEqual(parseMenuId('bn-tag-default'), { kind: 'save', tagIds: [] });
  assert.deepEqual(parseMenuId('bn-tag-12'), { kind: 'save', tagIds: [12] });
  assert.deepEqual(parseMenuId('bn-refresh'), { kind: 'refresh' });
  assert.deepEqual(parseMenuId('bn-setup'), { kind: 'setup' });
  assert.equal(parseMenuId('bn-root'), null);
  assert.equal(parseMenuId('other'), null);
});
```

`extension/tests/selection.test.js`:
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickText } from '../lib/selection.js';

test('ưu tiên text đọc từ trang (giữ xuống dòng)', () => {
  assert.equal(pickText('dòng 1\ndòng 2', 'dòng 1 dòng 2'), 'dòng 1\ndòng 2');
});

test('script lỗi / rỗng / không phải chuỗi → dùng selectionText', () => {
  assert.equal(pickText(undefined, 'fallback'), 'fallback');
  assert.equal(pickText('   ', 'fallback'), 'fallback');
  assert.equal(pickText(42, 'fallback'), 'fallback');
});

test('không có gì → chuỗi rỗng', () => {
  assert.equal(pickText(undefined, undefined), '');
});
```

- [ ] **Step 3: Chạy test, xác nhận thất bại**

Run: `cd extension && npm test`
Expected: FAIL — `Cannot find module '../lib/config.js'` (và tương tự cho các file khác).

- [ ] **Step 4: Cài đặt**

`extension/lib/config.js`:
```js
export function normalizeServerUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    throw new Error('URL không hợp lệ (vd: https://bangnote.vercel.app)');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('URL phải bắt đầu bằng http:// hoặc https://');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

export function originPattern(serverUrl) {
  return `${new URL(serverUrl).origin}/*`;
}
```

`extension/lib/api.js`:
```js
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest(config, method, path, body, fetchImpl = fetch) {
  const headers = { authorization: `Bearer ${config.apiKey}` };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetchImpl(`${config.serverUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được server');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Lỗi ${res.status}`);
  return data;
}

export const fetchTags = (config, fetchImpl) => apiRequest(config, 'GET', '/api/tags', undefined, fetchImpl);

export const createNote = (config, note, fetchImpl) => apiRequest(config, 'POST', '/api/notes', note, fetchImpl);
```

`extension/lib/menu.js`:
```js
const ROOT = 'bn-root';
const CONTEXTS = ['selection'];

/** Chrome dùng `&` làm phím tắt menu; `&&` hiển thị thành `&`. */
const escapeTitle = (s) => s.replace(/&/g, '&&');

export function buildMenuItems({ configured, tags }) {
  if (!configured) return [{ id: 'bn-setup', title: 'BangNote: mở cài đặt', contexts: CONTEXTS }];

  const tagItems = tags.length
    ? tags.map((tag) => ({
        id: tag.isDefault ? 'bn-tag-default' : `bn-tag-${tag.id}`,
        parentId: ROOT,
        title: escapeTitle(tag.name),
        contexts: CONTEXTS,
      }))
    : [{ id: 'bn-tag-default', parentId: ROOT, title: 'Chưa phân loại', contexts: CONTEXTS }];

  return [
    { id: ROOT, title: 'Gửi tới BangNote', contexts: CONTEXTS },
    ...tagItems,
    { id: 'bn-sep', parentId: ROOT, type: 'separator', contexts: CONTEXTS },
    { id: 'bn-refresh', parentId: ROOT, title: '↻ Làm mới danh sách tag', contexts: CONTEXTS },
  ];
}

export function parseMenuId(id) {
  if (id === 'bn-setup') return { kind: 'setup' };
  if (id === 'bn-refresh') return { kind: 'refresh' };
  if (id === 'bn-tag-default') return { kind: 'save', tagIds: [] };
  const match = /^bn-tag-(\d+)$/.exec(id);
  return match ? { kind: 'save', tagIds: [Number(match[1])] } : null;
}
```

`extension/lib/selection.js`:
```js
/** Text đọc từ trang giữ xuống dòng; `selectionText` của menu thì gộp thành một dòng — chỉ dùng làm dự phòng. */
export function pickText(scripted, fallback) {
  if (typeof scripted === 'string' && scripted.trim()) return scripted;
  return fallback ?? '';
}
```

- [ ] **Step 5: Chạy test**

Run: `npm test`
Expected: tất cả PASS (`# fail 0`).

- [ ] **Step 6: Commit**

```bash
git add extension
git commit -m "feat(extension): pure helpers for config, API, menu and selection"
```

---

### Task 2: Icon, manifest, service worker, trang Tuỳ chọn

**Files:**
- Create: `extension/tools/make-icons.mjs`, `extension/icons/*.png` (sinh ra), `extension/manifest.json`, `extension/lib/storage.js`, `extension/background.js`, `extension/options.html`, `extension/options.js`

**Interfaces:**
- Consumes: toàn bộ `lib/*` từ Task 1; API web §4.1.
- Produces:
  - `storage.js`: `loadConfig(): Promise<{serverUrl, apiKey} | null>`, `saveConfig(config): Promise<void>`, `loadCachedTags(): Promise<Tag[]>`, `saveCachedTags(tags): Promise<void>` (khoá `chrome.storage.local`: `serverUrl`, `apiKey`, `tags`).
  - Extension cài được bằng *Load unpacked*.

- [ ] **Step 1: Script sinh icon (PNG thuần, không dependency)**

`extension/tools/make-icons.mjs`:
```js
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel((x + 0.5) / size, (y + 0.5) / size), y * stride + 1 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BLUE = [37, 99, 235, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];
const R = 0.2;

function insideRoundedSquare(u, v) {
  const dx = Math.max(R - u, 0, u - (1 - R));
  const dy = Math.max(R - v, 0, v - (1 - R));
  return dx * dx + dy * dy <= R * R;
}

const BARS = [
  [0.28, 0.36, 0.72],
  [0.46, 0.54, 0.72],
  [0.64, 0.72, 0.58],
];

function pixel(u, v) {
  if (!insideRoundedSquare(u, v)) return CLEAR;
  for (const [top, bottom, right] of BARS) if (v >= top && v <= bottom && u >= 0.28 && u <= right) return WHITE;
  return BLUE;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`../icons/icon${size}.png`, import.meta.url), png(size, pixel));
}
console.log('Đã tạo icons/icon{16,32,48,128}.png');
```

Run: `npm run icons`
Expected: `Đã tạo icons/icon{16,32,48,128}.png`; mở `icons/icon128.png` thấy ô vuông bo góc xanh với 3 vạch trắng.

- [ ] **Step 2: manifest.json**

`extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "BangNote",
  "version": "1.0.0",
  "description": "Gửi đoạn chữ đã chọn tới BangNote",
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  "action": {
    "default_title": "BangNote — mở cài đặt",
    "default_icon": { "16": "icons/icon16.png", "32": "icons/icon32.png" }
  },
  "permissions": ["contextMenus", "storage", "scripting", "activeTab", "alarms", "notifications"],
  "optional_host_permissions": ["https://*/*", "http://*/*"],
  "background": { "service_worker": "background.js", "type": "module" },
  "options_ui": { "page": "options.html", "open_in_tab": true },
  "commands": {
    "save-selection": {
      "suggested_key": { "default": "Alt+Shift+S" },
      "description": "Lưu vùng chọn vào BangNote (tag mặc định)"
    }
  }
}
```

- [ ] **Step 3: storage.js**

`extension/lib/storage.js`:
```js
export async function loadConfig() {
  const { serverUrl, apiKey } = await chrome.storage.local.get(['serverUrl', 'apiKey']);
  return serverUrl && apiKey ? { serverUrl, apiKey } : null;
}

export async function saveConfig({ serverUrl, apiKey }) {
  await chrome.storage.local.set({ serverUrl, apiKey });
}

export async function loadCachedTags() {
  const { tags } = await chrome.storage.local.get('tags');
  return Array.isArray(tags) ? tags : [];
}

export async function saveCachedTags(tags) {
  await chrome.storage.local.set({ tags });
}
```

- [ ] **Step 4: background.js**

`extension/background.js`:
```js
import { createNote, fetchTags } from './lib/api.js';
import { buildMenuItems, parseMenuId } from './lib/menu.js';
import { pickText } from './lib/selection.js';
import { loadCachedTags, loadConfig, saveCachedTags } from './lib/storage.js';

// Dựng lại menu tuần tự để hai lần dựng chồng nhau không tạo trùng id.
let menuChain = Promise.resolve();
function rebuildMenus() {
  menuChain = menuChain.then(doRebuildMenus).catch((err) => console.error('BangNote menu', err));
  return menuChain;
}

async function doRebuildMenus() {
  const config = await loadConfig();
  let tags = await loadCachedTags();
  if (config) {
    try {
      tags = await fetchTags(config);
      await saveCachedTags(tags);
    } catch (err) {
      console.warn('BangNote: không tải được tag', err);
    }
  }
  await chrome.contextMenus.removeAll();
  for (const item of buildMenuItems({ configured: !!config, tags })) {
    await new Promise((resolve) =>
      chrome.contextMenus.create(item, () => {
        if (chrome.runtime.lastError) console.warn('BangNote menu', chrome.runtime.lastError.message);
        resolve();
      }),
    );
  }
}

function notify(message) {
  chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png', title: 'BangNote', message });
}

async function flash(tabId, ok) {
  await chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#16a34a' : '#dc2626' });
  await chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => undefined), 2000);
}

async function readSelection(tabId, frameId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      func: () => window.getSelection()?.toString() ?? '',
    });
    return res?.result;
  } catch {
    return undefined; // PDF viewer, chrome://, Web Store… không cho chạy script
  }
}

async function saveSelection(tab, frameId, selectionText, tagIds) {
  if (!tab?.id) return;
  const config = await loadConfig();
  if (!config) {
    chrome.runtime.openOptionsPage();
    return;
  }
  const content = pickText(await readSelection(tab.id, frameId), selectionText);
  if (!content.trim()) {
    await flash(tab.id, false);
    notify('Không có chữ nào được chọn');
    return;
  }
  try {
    await createNote(config, {
      content,
      source: 'extension',
      tagIds,
      sourceUrl: tab.url ?? null,
      sourceTitle: tab.title ?? null,
    });
    await flash(tab.id, true);
  } catch (err) {
    await flash(tab.id, false);
    notify(err.message);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('refresh-tags', { periodInMinutes: 30 });
  rebuildMenus();
});
chrome.runtime.onStartup.addListener(() => rebuildMenus());
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'refresh-tags') rebuildMenus();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.serverUrl || changes.apiKey)) rebuildMenus();
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const action = parseMenuId(String(info.menuItemId));
  if (!action) return;
  if (action.kind === 'setup') chrome.runtime.openOptionsPage();
  else if (action.kind === 'refresh') rebuildMenus().then(() => notify('Đã làm mới danh sách tag'));
  else saveSelection(tab, info.frameId ?? 0, info.selectionText, action.tagIds);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'save-selection') saveSelection(tab, 0, undefined, []);
});
```

- [ ] **Step 5: Trang Tuỳ chọn**

`extension/options.html`:
```html
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Cài đặt BangNote</title>
    <style>
      body { font: 14px system-ui, sans-serif; max-width: 460px; margin: 40px auto; padding: 0 16px; color: #0f172a; }
      h1 { font-size: 20px; }
      label { display: block; margin: 16px 0 4px; font-weight: 600; }
      input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; }
      .row { display: flex; gap: 8px; margin-top: 20px; }
      button { padding: 8px 16px; border-radius: 8px; border: 1px solid #0f172a; background: #0f172a; color: #fff; font: inherit; cursor: pointer; }
      button.secondary { background: #fff; color: #0f172a; }
      #status { margin-top: 16px; min-height: 20px; }
      .ok { color: #15803d; } .err { color: #b91c1c; }
      .hint { color: #64748b; font-size: 12px; margin-top: 24px; }
    </style>
  </head>
  <body>
    <h1>Cài đặt BangNote</h1>
    <form id="form">
      <label for="serverUrl">URL server</label>
      <input id="serverUrl" placeholder="https://bangnote.vercel.app" required />
      <label for="apiKey">API key</label>
      <input id="apiKey" type="password" required />
      <div class="row">
        <button type="submit">Lưu</button>
        <button type="button" id="test" class="secondary">Kiểm tra kết nối</button>
      </div>
    </form>
    <div id="status"></div>
    <p class="hint">
      Bôi đen chữ → chuột phải → <b>Gửi tới BangNote</b>. Phím tắt <b>Alt+Shift+S</b> lưu vào "Chưa phân loại"
      (đổi tại chrome://extensions/shortcuts).
    </p>
    <script type="module" src="options.js"></script>
  </body>
</html>
```

`extension/options.js`:
```js
import { fetchTags } from './lib/api.js';
import { normalizeServerUrl, originPattern } from './lib/config.js';
import { loadConfig, saveConfig } from './lib/storage.js';

const $ = (id) => document.getElementById(id);
const status = (text, ok) => {
  $('status').textContent = text;
  $('status').className = ok === undefined ? '' : ok ? 'ok' : 'err';
};

/** Đọc form; ném Error khi không hợp lệ. Đồng bộ để request quyền ngay sau đó vẫn trong user gesture. */
function readForm() {
  const serverUrl = normalizeServerUrl($('serverUrl').value);
  const apiKey = $('apiKey').value.trim();
  if (!apiKey) throw new Error('Chưa nhập API key');
  return { serverUrl, apiKey };
}

async function withPermission(handler) {
  let config;
  try {
    config = readForm();
  } catch (err) {
    status(err.message, false);
    return;
  }
  const granted = await chrome.permissions.request({ origins: [originPattern(config.serverUrl)] });
  if (!granted) {
    status('Cần cấp quyền truy cập server để gửi ghi chú', false);
    return;
  }
  await handler(config);
}

$('form').addEventListener('submit', (event) => {
  event.preventDefault();
  withPermission(async (config) => {
    await saveConfig(config);
    $('serverUrl').value = config.serverUrl;
    status('Đã lưu. Menu chuột phải đang được cập nhật…', true);
  });
});

$('test').addEventListener('click', () => {
  withPermission(async (config) => {
    status('Đang kiểm tra…');
    try {
      const tags = await fetchTags(config);
      status(`Kết nối OK — ${tags.length} tag`, true);
    } catch (err) {
      status(err.message, false);
    }
  });
});

loadConfig().then((config) => {
  if (!config) return;
  $('serverUrl').value = config.serverUrl;
  $('apiKey').value = config.apiKey;
});
```

- [ ] **Step 6: Unit test vẫn xanh**

Run: `npm test`
Expected: tất cả PASS.

- [ ] **Step 7: Kiểm tra bằng tay (cần web đang chạy — `npm run dev` trong `web/` với `API_KEY=dev-key` trong `.env.local`)**

1. Chrome → `chrome://extensions` → bật *Developer mode* → *Load unpacked* → chọn thư mục `extension/`. Expected: không có lỗi đỏ; trang Tuỳ chọn tự mở khi bấm icon.
2. Tuỳ chọn: URL `http://localhost:3000/`, key `dev-key` → *Kiểm tra kết nối* → chấp nhận quyền → "Kết nối OK — n tag". *Lưu* → URL hiện thành `http://localhost:3000`.
3. Mở một bài Wikipedia, bôi đen 2 đoạn → chuột phải → *Gửi tới BangNote* → thấy các tag giống trên web → chọn "Lịch sử". Expected: badge ✓ xanh 2 giây; trên web có ghi chú nguồn Extension, giữ xuống dòng, có link bài viết, tag "Lịch sử".
4. Bôi đen → `Alt+Shift+S` → ghi chú vào "Chưa phân loại".
5. Tạo tag mới trên web → *↻ Làm mới danh sách tag* → tag mới xuất hiện trong menu.
6. Dừng web server → gửi thử → badge `!` đỏ + thông báo "Không kết nối được server".
7. Đổi key sai trong Tuỳ chọn → gửi → thông báo "API key không hợp lệ".
8. Mở một file PDF trong Chrome, bôi đen → *Gửi tới BangNote* → vẫn lưu được (text một dòng).
9. Edge: lặp lại bước 1–3 tại `edge://extensions`.

- [ ] **Step 8: Commit**

```bash
git add extension
git commit -m "feat(extension): MV3 context menu, shortcut, options page and icons"
```

---

### Task 3: Tài liệu extension

**Files:**
- Modify: `README.md` (thêm mục), `docs/manual-test.md` (thêm mục)

- [ ] **Step 1: Thêm vào `README.md` (sau mục "Triển khai web")**

```markdown
## Cài extension (Chrome / Edge)

1. Mở `chrome://extensions` (Edge: `edge://extensions`) → bật **Developer mode**.
2. **Load unpacked** → chọn thư mục `extension/`.
3. Bấm icon BangNote → nhập **URL server** (domain Vercel) và **API key** (biến `API_KEY`) → **Kiểm tra kết nối** → chấp nhận quyền → **Lưu**.
4. Dùng: bôi đen → chuột phải → **Gửi tới BangNote** → chọn tag. Phím tắt `Alt+Shift+S` lưu vào "Chưa phân loại" (đổi tại `chrome://extensions/shortcuts`).

Sau khi sửa code extension: bấm ↻ trên thẻ extension trong `chrome://extensions`. Test: `cd extension && npm test`.
```

- [ ] **Step 2: Thêm vào `docs/manual-test.md`**

```markdown
## Extension
- [ ] Load unpacked không lỗi trên Chrome và Edge.
- [ ] Tuỳ chọn: URL có `/` cuối được chuẩn hoá; URL thiếu `https://` báo lỗi; "Kiểm tra kết nối" báo số tag.
- [ ] Menu chuột phải hiện đủ tag; tag tên có `&` hiển thị đúng.
- [ ] Lưu có tag / không tag; giữ xuống dòng; có link + tiêu đề trang.
- [ ] `Alt+Shift+S` lưu vào "Chưa phân loại"; không bôi đen gì → thông báo "Không có chữ nào được chọn".
- [ ] "↻ Làm mới danh sách tag" cập nhật tag mới tạo.
- [ ] Trang PDF: vẫn lưu được.
- [ ] Server tắt → badge đỏ + "Không kết nối được server"; key sai → "API key không hợp lệ".
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/manual-test.md
git commit -m "docs: extension install guide and manual tests"
```
