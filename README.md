# BangNote

Gom nhanh các đoạn text từ điện thoại (bot Telegram), trình duyệt (extension) và Windows (widget kéo thả) vào một kho, phân loại bằng tag.

| Thư mục | Nội dung |
|---|---|
| `web/` | Next.js: web admin + API + webhook bot (deploy Vercel, DB Neon) |
| `extension/` | Extension Chrome/Edge |
| `widget/` | Widget Windows (WPF .NET 8) |

## Triển khai web

1. **Neon**: tạo project tại neon.tech → copy *Connection string* (bản pooled) làm `DATABASE_URL`.
2. **Migration** (trên máy dev):
   ```bash
   cd web
   npm install
   cp .env.example .env.local   # điền DATABASE_URL
   npm run db:migrate           # → Đã chạy: 0001_init.sql
   ```
3. **Bot**: chat với @BotFather → `/newbot` → lấy token làm `TELEGRAM_BOT_TOKEN`.
4. **Vercel**: *Add New Project* → import repo → **Root Directory = `web`** → thêm đủ biến trong `web/.env.example` (tạm để `TELEGRAM_OWNER_ID` trống) → Deploy.
5. Nhắn `/start` cho bot → bot trả user ID → đặt `TELEGRAM_OWNER_ID` trên Vercel → **Redeploy**.
6. Mở domain production → đăng nhập → **Cài đặt** → *Đăng ký webhook* → dòng "Webhook hiện tại" hiện ✓ đúng.
7. Gửi thử một tin nhắn cho bot → bot trả "✅ Đã lưu #1".

Khi thêm migration mới sau này: tạo `web/db/migrations/000N_ten.sql` rồi chạy lại `npm run db:migrate`.

## Cài extension (Chrome / Edge)

1. Mở `chrome://extensions` (Edge: `edge://extensions`) → bật **Developer mode**.
2. **Load unpacked** → chọn thư mục `extension/`.
3. Bấm icon BangNote → nhập **URL server** (domain Vercel) và **API key** (biến `API_KEY`) → **Kiểm tra kết nối** → chấp nhận quyền → **Lưu**.
4. Dùng: bôi đen → chuột phải → **Gửi tới BangNote** → chọn tag. Phím tắt `Alt+Shift+S` lưu vào "Chưa phân loại" (đổi tại `chrome://extensions/shortcuts`).

Sau khi sửa code extension: bấm ↻ trên thẻ extension trong `chrome://extensions`. Test: `cd extension && npm test`.

## Phát triển

```bash
cd web
npm test          # Vitest + PGlite, không cần DB thật
npm run typecheck
npm run dev       # cần .env.local
```
