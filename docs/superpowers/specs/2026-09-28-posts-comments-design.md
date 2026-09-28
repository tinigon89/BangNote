# BangNote — Bài / comment trong tag & phân trang

Ngày: 2026-09-28 · Trạng thái: chờ duyệt · Bổ sung cho `2026-09-28-tag-numbering-design.md`.

## 1. Mục tiêu

Luồng dùng thật: đọc một bài Facebook → gửi nội dung bài (một ghi chú) → gửi dần các comment (nhiều ghi chú) → sang bài khác. Cần:

- Số thứ tự hai cấp trong mỗi tag: **bài** `#5`, **comment** `#5.1`, `#5.2`…
- Mặc định ghi chú mới là **comment của bài mới nhất**; nút **📌 Bài mới** để mở bài mới.
- Xem theo nhóm (bài + comment thụt vào, thu gọn được), chọn cả bài bằng một tick.
- Phân trang theo số trang, không giới hạn 500.

## 2. Dữ liệu

Migration `0003_post_comments.sql`:

```
notes + sub integer NOT NULL DEFAULT 0     -- 0 = chính bài; ≥1 = comment thứ sub của bài `position`
DROP INDEX notes_tag_position; CREATE INDEX notes_tag_position ON notes (tag_id, position, sub)
```

Mọi ghi chú hiện có trở thành bài (`sub = 0`), giữ nguyên `position`. Không xoá dữ liệu.

Thuật ngữ: **nhóm** = tất cả ghi chú cùng `(tag_id, position)`. **Bài cuối** = nhóm có `position` lớn nhất trong tag.

Hiển thị số: `sub = 0` → `#<position>`; `sub > 0` → `#<position>.<sub>`. Hàm dùng chung `formatNumber(position, sub)`.

## 3. Quy tắc

| Hành động | Kết quả |
|---|---|
| Tạo ghi chú (mọi kênh) | Tag rỗng → bài `#1`. Ngược lại → comment của bài cuối: `sub = max(sub của nhóm) + 1` |
| **📌 Bài mới** trên ghi chú X (thuộc nhóm P, sub s) | X và mọi ghi chú cùng nhóm có `sub > s` (theo thứ tự sub) thành nhóm mới `position = max(position trong tag) + 1`, X là bài (`sub 0`), các ghi chú sau là `.1, .2…`. X đã là bài → không đổi |
| **↳ Gộp vào bài trước** trên bài P | Nhóm P (bài + comment, theo sub) nối vào cuối nhóm đứng ngay trước P (position lớn nhất < P) thành các comment tiếp theo. Không có nhóm trước → lỗi "Không có bài nào trước" |
| Chuyển tag (một hoặc nhiều ghi chú) | Theo từng nhóm nguồn, theo thứ tự đang chọn: nếu chọn **bài** của nhóm → các ghi chú được chọn trong nhóm thành nhóm mới cuối tag đích (bài + .1…). Nếu chỉ chọn comment → chúng thành comment nối tiếp của bài cuối tag đích (tag đích rỗng → ghi chú đầu thành bài #1). Chuyển vào chính tag đang ở → không đổi |
| Xoá | Không dồn số. Nhóm mất bài (chỉ còn comment) vẫn hiển thị `#5.2`… cho tới khi Đánh số lại |
| **Đánh số lại** (một tag) | Chạy trên **toàn bộ tag**, theo sort đang chọn: nhóm được xếp theo ghi chú đầu tiên của nhóm theo sort đó, đánh 1…n; trong nhóm giữ thứ tự sub hiện tại, đánh 0, 1, 2… (nhóm mất bài → comment đầu thành bài) |
| **Kéo bài** | Di chuyển cả nhóm tới trước/sau nhóm đích trên toàn tag, rồi đánh position 1…n cho mọi nhóm (sub không đổi) |
| **Kéo comment** | Chỉ trong nhóm của nó: đặt trước/sau comment đích, đánh lại sub 1…k (bài giữ sub 0). Thả ra ngoài nhóm → bỏ qua |

Mọi thao tác đổi số khoá dòng tag (`lockTag`) trong transaction như hiện tại.

Kéo và nút tách/gộp chỉ bật khi `canReorder` (lọc đúng 1 tag, sort "Theo số #", không tìm kiếm/nguồn/thời gian) — riêng 📌/↳ bật ở mọi chế độ khi thẻ đang hiện.

## 4. Web

**Chế độ nhóm** (lọc đúng 1 tag + sort "Theo số #"; tìm kiếm/nguồn/thời gian vẫn áp dụng lên từng ghi chú, nhóm nào còn ít nhất 1 ghi chú khớp thì hiện nhóm đó với các ghi chú khớp):
- Thẻ bài; comment thụt vào bên dưới, viền trái nhạt.
- Nút **▸/▾** trên thẻ bài thu gọn/mở comment (nhớ trong `localStorage` theo tag), hiện "(n comment)" khi thu gọn.
- Ô **"Chỉ hiện bài viết"** trong bộ lọc (`posts=1`): ẩn comment, vẫn hiện số comment.
- Tick thẻ bài → chọn bài + mọi comment đang hiện của nhóm (bỏ tick → bỏ cả nhóm); tick comment → chỉ comment đó. Kéo chọn (cột trái) và Shift+click giữ nguyên hành vi trên thứ tự đang hiện.
- Tay nắm ⠿ trên cả thẻ bài lẫn comment (khi `canReorder`).

**Chế độ phẳng** (mọi trường hợp khác): như hiện tại; chip `Temp #5.3`.

**Phân trang** (thay "Tải thêm"): `page` trên URL (≥ 1, mặc định 1).
- Chế độ nhóm: 20 nhóm/trang (lấy 20 `(tag_id, position)` đầu theo thứ tự, rồi toàn bộ ghi chú của chúng).
- Chế độ phẳng: 50 ghi chú/trang.
- Thanh `‹ 1 2 … 12 ›`: trang đầu, cuối, hiện tại ±2, dấu `…`; giữ mọi bộ lọc.
- `page` vượt quá → hiện trang cuối có dữ liệu. Tham số `limit` cũ bị bỏ.

**Nút trên thẻ:** `📌 Bài mới` (trên comment), `↳ Gộp vào bài trước` (trên bài có nhóm trước). Có xác nhận khi thao tác đổi số của nhiều hơn 1 ghi chú.

**Xuất file:** toàn bộ kết quả lọc (bỏ qua `page`, tối đa 5000 ghi chú), thứ tự như danh sách; số dạng `#5` / `#5.3`.

## 5. Bot, widget, extension, API

- API: `Note` thêm `sub`; `POST /api/notes`, `PUT /api/notes/:id/tags` trả thêm `sub`. Endpoint mới `POST /api/notes/:id/new-post` (API key) → `{ id, tags, position, sub }` (dùng cho widget).
- Telegram: trả lời `✅ Đã lưu — Temp #5.3`; hàng cuối bàn phím `[📌 Bài mới] [🗑 Xoá]`; callback `n:<noteId>` → tách, sửa tin nhắn thành `✅ Đã lưu — Temp #6`, trả lời `📌 Bài mới #6`. Ghi chú đã là bài → trả lời "Đã là bài #6". `/recent` dùng `formatNumber`. Chuyển tag qua nút tag theo quy tắc chuyển tag (1 ghi chú).
- Widget: `NoteDto.Sub`, nhãn `Đã lưu — Temp #5.3`; chip **📌 Bài mới** trước các chip tag (ẩn khi ghi chú đã là bài); bấm → gọi `new-post`, cập nhật nhãn.
- Extension: không đổi.

## 6. Kiểm thử

- Migration 0003: dữ liệu cũ → sub 0, số giữ nguyên.
- `createNote`: tag rỗng → #1; tiếp theo → #1.1, #1.2; sau 📌 → nối vào bài mới.
- `splitPost`: tách giữa nhóm (kéo theo comment sau), trên bài → không đổi, giữ lock.
- `mergeIntoPrevious`: nối cuối nhóm trước, không có nhóm trước → lỗi.
- `moveNotes`: chọn cả nhóm / chỉ comment / tag đích rỗng / chính tag.
- `renumberTag` theo sort (position, oldest…), nhóm mất bài.
- Kéo bài / kéo comment (server) và logic kéo phía client (ReorderSession theo nhóm).
- Phân trang: đếm trang theo nhóm và theo ghi chú, trang vượt quá.
- Telegram `n:` callback; widget `new-post`; định dạng số trong xuất file.
- Trình duyệt (Edge headless): chế độ nhóm, thu gọn, chọn cả bài, kéo bài, phân trang.
