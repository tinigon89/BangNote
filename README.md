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
   > **Cập nhật từ bản cũ:** chạy lại `npm run db:migrate` rồi push code để Vercel deploy ngay (giữa hai bước web/bot cũ sẽ lỗi), sau đó build lại widget.
   > - `0002`: nhiều tag → 1 tag có số (xoá bảng `note_tags`; nên tạo branch sao lưu Neon trước).
   > - `0003`: thêm số comment (`#bài.comment`); không xoá dữ liệu.

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
- Sau khi lưu, widget hiện "Đã lưu — Tag #n"; bấm nút tag khác trong 5 giây để chuyển tag.
- Nút **📌** góc trên phải: bật trước khi thả → lần lưu kế tiếp thành **bài mới** (tự tắt sau khi lưu). Sau khi lưu một comment cũng có chip **📌 Bài mới** trong 5 giây.
- Mất mạng / sai key: ghi chú được giữ ở `%AppData%\BangNote\queue.json` và tự gửi lại mỗi phút.
- Không kéo được từ app chạy bằng quyền Administrator (Windows chặn).

Không muốn cài runtime: thay `--self-contained false` bằng `--self-contained true` (file ~70MB). Test: `cd widget && dotnet test`.

## Bài & comment

Mỗi tag gồm các **bài** `#1, #2…`, mỗi bài có **comment** `#1.1, #1.2…`.

- Ghi chú mới mặc định là comment của bài cuối trong tag. Tự thành **bài mới** khi: tag rỗng · đổi nguồn gửi (web ↔ bot ↔ widget ↔ extension) · extension sang link bài khác · tick **Là bài mới** (web) · bấm **📌 Bài mới** (web, bot, widget).
- **↳ Gộp vào bài trước** khi tách nhầm. **Đánh số lại** chạy trên toàn tag theo cách sắp xếp đang chọn.
- Lọc 1 tag + "Theo số #": xem theo nhóm, ▸/▾ thu gọn, "Chỉ hiện bài viết", tick bài = chọn cả comment, kéo ⠿ bài hoặc comment. 20 bài/trang (chế độ khác 50 ghi chú/trang).

## Phát triển

```bash
cd web
npm test          # Vitest + PGlite, không cần DB thật
npm run typecheck
npm run dev       # cần .env.local
```
