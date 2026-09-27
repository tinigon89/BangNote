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
4. **Vercel**: *Add New Project* → import repo → **Root Directory = `web`** (Node.js ≥ 22) → thêm đủ biến trong `web/.env.example` (tạm để `TELEGRAM_OWNER_ID` trống) → Deploy.
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

## Cài widget Windows

Cần [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0) (x64).

```bash
cd widget
dotnet publish src/BangNote.Widget -c Release -r win-x64 -p:PublishSingleFile=true --self-contained false -o publish
```

Chép `publish/BangNote.Widget.exe` vào nơi cố định (vd: `C:\Tools\BangNote\`) rồi chạy. Lần đầu nhập **URL server** và **API key** → *Kiểm tra* → *Lưu*. Bật "Khởi động cùng Windows" trong Cài đặt hoặc menu khay.

- Kéo thả chữ đã chọn vào ô nổi, hoặc bấm vào ô rồi `Ctrl+V`.
- **Alt+Insert** (ở bất kỳ app nào) để ẩn/hiện widget. Laptop có thể cần bấm kèm `Fn`. Nếu app khác đã chiếm tổ hợp này, widget báo ở khay và bạn dùng icon khay thay thế.
- Sau khi lưu, bấm nút tag trong 5 giây để chuyển tag.
- Mất mạng / sai key: ghi chú được giữ ở `%AppData%\BangNote\queue.json` và tự gửi lại mỗi phút.
- Không kéo được từ app chạy bằng quyền Administrator (Windows chặn).

Không muốn cài runtime: thay `--self-contained false` bằng `--self-contained true` (file ~70MB). Test: `cd widget && dotnet test`.

## Phát triển

```bash
cd web
npm test          # Vitest + PGlite, không cần DB thật
npm run typecheck
npm run dev       # cần .env.local
```
