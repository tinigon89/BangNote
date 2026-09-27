# BangNote — Thiết kế

Ngày: 2026-09-27 · Trạng thái: chờ duyệt

## 1. Mục tiêu

Công cụ cá nhân (1 người dùng) để gom nhanh các đoạn text từ nhiều nơi vào một kho duy nhất, phân loại bằng tag tùy chỉnh (Lịch sử, Y học…), rồi xem/tìm/dọn dẹp trên web.

Kênh lưu:

| Kênh | Thao tác |
|---|---|
| Điện thoại | Copy text → gửi cho bot Telegram |
| Trình duyệt PC | Bôi đen → chuột phải → *Gửi tới BangNote* (hoặc `Alt+Shift+S`) |
| Mọi app trên Windows | Kéo thả chữ đã chọn vào widget nổi |
| Web admin | Dán vào ô thêm nhanh |

**Tiêu chí thành công**
- Lưu 1 đoạn text từ bất kỳ kênh nào mất ≤ 2 thao tác, không bắt buộc chọn tag.
- Không mất text: widget có hàng đợi offline; bot/extension báo lỗi rõ ràng.
- Tìm lại được bằng từ khóa không dấu và lọc theo tag.

**Ngoài phạm vi (YAGNI)**: nhiều người dùng, lưu ảnh/file, đồng bộ offline hai chiều, phát hành lên Chrome Web Store, trình cài đặt MSI, chống trùng lặp.

## 2. Kiến trúc

```
 Điện thoại ──► Telegram ──webhook──┐
 Extension (Chrome/Edge) ──API key──┤
 Widget WPF (Win 10/11) ───API key──┼──► Next.js trên Vercel ──► Neon Postgres
 Trình duyệt (admin) ──cookie phiên─┘
```

- **Một project Next.js** (App Router, TypeScript) chứa: web admin, REST API cho client, webhook bot Telegram.
- **Neon Postgres** qua **Drizzle ORM** (driver `@neondatabase/serverless`).
- **Extension**: Manifest V3, JS thuần, không build step.
- **Widget**: WPF .NET 8.

Cấu trúc repo:

```
BangNote/
  web/         Next.js (admin + API + webhook bot)
  extension/   Chrome/Edge MV3
  widget/      .NET 8 WPF + project test xUnit
  docs/
```

## 3. Dữ liệu

```
notes      id serial PK · content text NOT NULL
           source text NOT NULL  ('telegram'|'extension'|'widget'|'web')
           source_url text NULL · source_title text NULL
           created_at timestamptz · updated_at timestamptz
tags       id serial PK · name text UNIQUE NOT NULL · color text NOT NULL
           is_default boolean NOT NULL DEFAULT false · created_at timestamptz
note_tags  note_id FK→notes ON DELETE CASCADE · tag_id FK→tags ON DELETE CASCADE
           PK(note_id, tag_id)
```

- ID là số nguyên để `callback_data` của Telegram (giới hạn 64 byte) chứa vừa `t:<noteId>:<tagId>`.
- Unique partial index: tối đa một tag có `is_default = true`. Migration seed tag mặc định **"Chưa phân loại"**.
- Tìm kiếm không dấu: extension `unaccent`; điều kiện `unaccent(lower(content)) LIKE unaccent(lower('%q%'))` (dùng wrapper `IMMUTABLE` để có thể đánh index trigram sau này nếu cần).

### Quy tắc tag mặc định

Toàn bộ nằm trong một hàm server `setNoteTags(noteId, tagIds)`; mọi kênh đều gọi hàm này (kể cả khi tạo note):

1. Loại tag mặc định khỏi `tagIds`, bỏ id trùng/không tồn tại.
2. Còn ≥ 1 tag thật → note chỉ mang các tag đó (tự bỏ "Chưa phân loại").
3. Rỗng → note mang đúng tag mặc định.

Tag mặc định đổi tên/màu được, **không xoá được**. Xoá một tag thường: các note không còn tag nào được gán lại tag mặc định (cùng transaction).

## 4. API

### 4.1 Cho extension & widget

Header bắt buộc: `Authorization: Bearer <API_KEY>`. Sai/thiếu → `401`.

| Method | Path | Body / Kết quả |
|---|---|---|
| `GET` | `/api/tags` | → `[{id, name, color, isDefault}]` sắp theo tên, tag mặc định đầu tiên |
| `POST` | `/api/notes` | `{content, source, tagIds?, sourceUrl?, sourceTitle?}` → `201 {id, content, tags:[…], createdAt}` |
| `PUT` | `/api/notes/:id/tags` | `{tagIds}` → `200 {id, tags:[…]}`; note không tồn tại → `404` |

Validation (zod): `content` được trim, rỗng → `400`, > 20 000 ký tự → `400`; `source` ∉ danh sách → `400`. Lỗi luôn trả `{error: string}`. Lỗi không lường trước → `500` (log server, không lộ chi tiết).

CORS: không cần — extension gọi từ service worker với `host_permissions`, widget không phải trình duyệt.

### 4.2 Webhook Telegram

`POST /api/telegram/webhook`
- Header `X-Telegram-Bot-Api-Secret-Token` phải bằng `TELEGRAM_WEBHOOK_SECRET`, nếu không → `401`.
- Update từ user khác `TELEGRAM_OWNER_ID` → trả `200`, không làm gì (trừ `/start`, xem §6).
- Luôn trả `200` cho update hợp lệ kể cả khi xử lý lỗi (tránh Telegram gửi lại vô hạn); lỗi được log và bot nhắn "❌ Lỗi khi lưu".

`POST /api/telegram/setup` (cần phiên admin): gọi `setWebhook` với URL `${origin}/api/telegram/webhook` và secret; trả kết quả `getWebhookInfo`.

### 4.3 Web admin

Đăng nhập bằng `ADMIN_PASSWORD` (so sánh constant-time). Phiên: cookie `HttpOnly; Secure; SameSite=Lax`, ký HMAC bằng `SESSION_SECRET`, hạn 30 ngày. Middleware chặn mọi trang trừ `/login`, `/api/*` (API tự xác thực). Thao tác dữ liệu trên admin dùng Server Actions, kiểm tra phiên ở từng action.

### 4.4 Biến môi trường

| Biến | Dùng cho |
|---|---|
| `DATABASE_URL` | Neon |
| `ADMIN_PASSWORD` | Đăng nhập web |
| `SESSION_SECRET` | Ký cookie phiên |
| `API_KEY` | Extension + widget |
| `TELEGRAM_BOT_TOKEN` | Bot |
| `TELEGRAM_WEBHOOK_SECRET` | Xác thực webhook |
| `TELEGRAM_OWNER_ID` | Chỉ nhận tin từ chủ |

## 5. Web admin

Next.js + Tailwind, responsive (dùng được trên điện thoại).

- **`/login`** — ô mật khẩu.
- **`/`** — danh sách ghi chú:
  - Ô thêm nhanh (textarea + chọn tag) → `source = 'web'`.
  - Tìm kiếm không dấu; lọc theo tag (nhiều tag, logic **OR**, gồm "Chưa phân loại"); lọc theo nguồn. Bộ lọc nằm trên query string để có thể bookmark.
  - Thẻ ghi chú: nội dung (thu gọn > 6 dòng, bấm mở), chip tag (bấm mở bộ chọn tag), nguồn + thời gian tương đối, link `source_url` (hiển thị `source_title`), nút Copy / Sửa (sửa nội dung tại chỗ) / Xoá (có xác nhận).
  - Chọn nhiều → *Chuyển tag* (thay toàn bộ tag qua `setNoteTags`) hoặc *Xoá*.
  - Mới nhất trước, 50 note/trang, nút "Tải thêm" (phân trang theo cursor `id`).
- **`/tags`** — bảng tag: tên, màu (bảng 10 màu có sẵn), số note; tạo / đổi tên / đổi màu / xoá (tag mặc định không có nút xoá). Tên trùng → báo lỗi.
- **`/settings`** — trạng thái webhook (`getWebhookInfo`), nút "Đăng ký webhook", hướng dẫn cài extension & widget, nút đăng xuất.

## 6. Bot Telegram

Viết thẳng bằng `fetch` tới Bot API (không cần thư viện), module `lib/telegram/`.

**Tin nhắn text** (gõ, dán, forward; với ảnh/video thì lấy `caption`; không có text → bỏ qua kèm nhắn "Chỉ hỗ trợ text"):
1. Tách hashtag: token dạng `#[\p{L}\p{N}_]+`. Chuẩn hoá cả hashtag và tên tag: bỏ dấu, lowercase, bỏ khoảng trắng và `_` → so khớp (`#LichSu`, `#lich_su`, `#lịchsử` → "Lịch sử").
2. Hashtag khớp → gắn tag và **cắt khỏi nội dung** (rồi trim, gộp khoảng trắng thừa). Hashtag không khớp → giữ nguyên trong nội dung, bot báo "Không có tag #xyz" (không tự tạo tag).
3. Nội dung còn lại rỗng → nhắn "Nội dung trống", không lưu.
4. Lưu với `source = 'telegram'`, trả lời:

```
✅ Đã lưu #123
[✓ Chưa phân loại] [Lịch sử] [Y học]
[Văn học] …                 [🗑 Xoá]
```

**Inline keyboard**: 3 nút/hàng, tag đang gắn có tiền tố `✓`, hàng cuối là `🗑 Xoá`.
- `t:<noteId>:<tagId>` → bật/tắt tag đó (qua `setNoteTags`), `editMessageReplyMarkup` để cập nhật, `answerCallbackQuery`.
- `d:<noteId>` → xoá note, sửa tin nhắn thành "🗑 Đã xoá #123".
- Note không còn tồn tại → `answerCallbackQuery` "Ghi chú không còn".

**Lệnh**
- `/start` — trả lời user ID của người gửi (cho **bất kỳ ai**, để lấy ID khi cài đặt); nếu là chủ thì thêm hướng dẫn ngắn.
- `/tags` — danh sách tag + số note.
- `/recent` — 5 ghi chú mới nhất (cắt 200 ký tự/note).

Tin > 4096 ký tự bị Telegram tách thành nhiều tin → mỗi tin là một ghi chú riêng (chấp nhận).

## 7. Extension Chrome/Edge

Manifest V3, JS thuần. Quyền: `contextMenus`, `storage`, `scripting`, `activeTab`, `alarms`, `notifications`; `optional_host_permissions: ["https://*/*", "http://*/*"]` — trang Tuỳ chọn xin quyền cho đúng origin server khi lưu.

- **Tuỳ chọn** (`options.html`): URL server, API key (lưu `chrome.storage.local`), nút "Kiểm tra kết nối" (gọi `GET /api/tags`).
- **Menu chuột phải** (context `selection`): mục cha *Gửi tới BangNote* → mục con cho từng tag (tag mặc định đầu tiên) → phân cách → *↻ Làm mới danh sách tag*. Dựng lại menu khi `onInstalled`, `onStartup`, lưu tuỳ chọn, và `alarms` mỗi 30 phút. Chưa cấu hình → chỉ có mục "Mở cài đặt BangNote".
- **Lấy text**: `scripting.executeScript` chạy `window.getSelection().toString()` trên tab (giữ xuống dòng); lỗi (PDF viewer, trang `chrome://`…) → dùng `info.selectionText`.
- **Phím tắt** (`commands`): `Alt+Shift+S` lưu vùng chọn hiện tại vào tag mặc định.
- Gửi kèm `sourceUrl = tab.url`, `sourceTitle = tab.title`, `source = 'extension'`.
- **Phản hồi**: badge `✓` nền xanh 2 giây; lỗi → badge `!` đỏ + `chrome.notifications` với thông điệp lỗi.
- Cài bằng *Load unpacked* (Developer mode).

## 8. Widget Windows

WPF .NET 8 (`net8.0-windows`), chạy Win 10/11.

- **Cửa sổ**: không viền, ~180×110, `Topmost`, nền bán trong suốt, bo góc; kéo để di chuyển; vị trí lưu lại. Chữ "Thả chữ vào đây".
- **Khay hệ thống** (NotifyIcon): Hiện/Ẩn · Cài đặt · Khởi động cùng Windows (khoá `HKCU\…\Run`) · Thoát.
- **Nhận text**: `AllowDrop`, chấp nhận `DataFormats.UnicodeText` / `Text`; `Ctrl+V` khi widget đang focus → lưu clipboard text. Định dạng khác → hiện "Chỉ nhận text" 2 giây.
- **Sau khi lưu**: nền xanh "Đã lưu #123", mở rộng hiện chip tag (lấy từ `GET /api/tags`, cache, làm mới mỗi 10 phút) trong 5 giây; bấm chip → `PUT /api/notes/:id/tags` (bật/tắt, giữ mở thêm 5 giây sau mỗi lần bấm). Không bấm → thu lại, note ở "Chưa phân loại".
- **Hàng đợi offline**: gửi lỗi mạng/5xx → thêm vào `%AppData%\BangNote\queue.json` (ghi atomic: file tạm rồi rename), nền cam "Đang chờ gửi (n)"; timer 60 giây gửi lại theo thứ tự. Lỗi 4xx (sai key, nội dung không hợp lệ) → không đưa vào hàng đợi, báo đỏ.
- **Cài đặt**: URL server + API key trong `%AppData%\BangNote\settings.json`; API key mã hoá bằng DPAPI (`ProtectedData`, scope CurrentUser). Lần chạy đầu chưa có cài đặt → mở hộp thoại Cài đặt.
- **Build**: `dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true --self-contained false` → `BangNote.Widget.exe` (cần .NET 8 Desktop Runtime). Tuỳ chọn `--self-contained true` (~70MB).
- **Giới hạn đã biết**: Windows (UIPI) chặn kéo thả từ app chạy quyền Administrator sang widget chạy quyền thường.

Cấu trúc code: `ApiClient` (HTTP), `OfflineQueue`, `SettingsStore`, `TagCache` là các lớp thuần, tách khỏi UI để test được; `MainWindow` chỉ lo hiển thị và sự kiện.

## 9. Kiểm thử

**Web (Vitest)**
- Unit: `setNoteTags` (đủ 3 nhánh + xoá tag), chuẩn hoá/tách hashtag, dựng inline keyboard, parse `callback_data`.
- Tích hợp: route handler `/api/notes`, `/api/tags`, `/api/notes/:id/tags` (401/400/404/201), webhook Telegram (secret sai, người lạ, text có hashtag, callback bật/tắt, xoá) với Bot API được mock.
- DB test chạy trên **PGlite** (Postgres in-memory) + migration thật; nếu PGlite không có `unaccent` thì test tìm kiếm chạy trên một branch Neon riêng (`DATABASE_URL_TEST`), các test khác vẫn chạy PGlite.

**Widget (xUnit)**: `OfflineQueue` (thêm/gửi lại/giữ thứ tự/file hỏng), `SettingsStore` (DPAPI round-trip), `ApiClient` với `HttpMessageHandler` giả (201, 401, timeout → vào hàng đợi).

**Extension & end-to-end**: checklist test tay trong `docs/manual-test.md` — cài extension, lưu có/không tag, phím tắt, trang PDF; widget kéo từ Chrome/Word/Notepad, mất mạng rồi có mạng lại; bot gửi text/forward/hashtag/bấm tag/xoá; admin lọc, tìm không dấu, chuyển tag hàng loạt, xoá tag.

## 10. Triển khai

1. Tạo project Neon, lấy `DATABASE_URL`; chạy migration (`drizzle-kit migrate`).
2. Tạo bot qua @BotFather → `TELEGRAM_BOT_TOKEN`.
3. Import `web/` vào Vercel (Root Directory = `web`), khai báo biến môi trường §4.4, deploy.
4. Nhắn `/start` cho bot để biết user ID → đặt `TELEGRAM_OWNER_ID` → redeploy.
5. Vào `/settings` → *Đăng ký webhook*.
6. Cài extension (Load unpacked) và chạy widget, nhập URL + API key.
