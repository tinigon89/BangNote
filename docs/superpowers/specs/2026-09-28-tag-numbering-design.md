# BangNote — Số thứ tự theo tag & tuỳ chọn xuất file

Ngày: 2026-09-28 · Trạng thái: chờ duyệt · Bổ sung cho `2026-09-27-bangnote-design.md` (các mục ở đây thay thế phần tương ứng của spec gốc).

## 1. Mục tiêu

- Mỗi tag có **dãy số riêng** (`Temp #1, #2…`), bắt đầu lại từ #1 khi tag rỗng.
- Sắp xếp lại ghi chú trong một tag bằng tay (kéo thả) và **Đánh số lại** 1…n.
- Xuất file: tuỳ chọn **kèm số #** và **kèm tag, ngày giờ, link** độc lập; giữa các ghi chú chỉ cách **một dòng trống**.

Thay đổi mô hình: **mỗi ghi chú thuộc đúng 1 tag** (tag như thư mục). Thay thế quy tắc "nhiều tag / tag mặc định tự bỏ" của spec gốc §3.

## 2. Dữ liệu

Migration `0002_single_tag_positions.sql`:

```
notes  + tag_id   integer NOT NULL REFERENCES tags(id)
       + position integer NOT NULL
INDEX notes_tag_position (tag_id, position)
DROP TABLE note_tags
```

Chuyển dữ liệu cũ:
- `tag_id` = tag thật đầu tiên của ghi chú (theo tên tag), không có → tag mặc định.
- `position` = `row_number() OVER (PARTITION BY tag_id ORDER BY created_at, id)`.

`id` vẫn là khoá nội bộ (callback Telegram, API), **không hiển thị** cho người dùng nữa. Không có ràng buộc UNIQUE trên (tag_id, position): chỗ trống và (hiếm) trùng số được chấp nhận; "Đánh số lại" luôn đưa về 1…n liền mạch.

## 3. Quy tắc

| Hành động | Kết quả |
|---|---|
| Tạo ghi chú / chuyển sang tag khác | `position = max(position trong tag) + 1`; tag rỗng → 1 |
| Chuyển vào chính tag đang ở | Không đổi gì |
| Xoá / chuyển đi | Giữ nguyên số của các ghi chú còn lại (có chỗ trống) |
| Xoá tag | Ghi chú của nó chuyển về tag mặc định, nối tiếp cuối dãy theo thứ tự số cũ |
| Đánh số lại (một tag) | Gán 1…n theo **thứ tự đang hiển thị** (sort + bộ lọc hiện tại, trong tag đó) |
| Bấm nút Telegram của tag đã bị xoá | Không đổi, trả lời "Tag không còn" |
| Kéo sắp xếp lại (một tag, sort "Theo số #") | Đặt ghi chú vào vị trí mới rồi gán 1…n cho **toàn bộ tag** theo thứ tự mới |

Chọn tag ở mọi nơi là **chọn 1**:
- Hàm server duy nhất `moveNote(db, noteId, tagId | null)` (null → tag mặc định). API giữ dạng `tagIds: number[]`: lấy tag thật đầu tiên còn tồn tại, không có → mặc định.
- Admin web: bộ chọn tag trên thẻ và "Chuyển tag" hàng loạt là radio (có mục "Chưa phân loại"). Chuyển hàng loạt nối tiếp theo thứ tự đang hiển thị.
- Telegram: bấm tag khác → chuyển sang tag đó; bấm tag hiện tại → không đổi. Hashtag: lấy tag khớp đầu tiên; khớp nhiều hơn 1 → cảnh báo "Chỉ gắn 1 tag: <tên tag>".
- Widget: bấm chip → chuyển sang tag đó (chip hiện tại có ✓).
- Extension: không đổi (vốn gửi 1 tag).

## 4. Hiển thị

- Kiểu `Note` có thêm `position: number`; `tags` vẫn là mảng 1 phần tử (giữ tương thích client).
- Thẻ ghi chú: chip `Temp #3` (bỏ `#id`). Tay nắm ⠿ chỉ hiện khi đang lọc **đúng 1 tag** và sort = "Theo số #".
- Sort mới **"Theo số #"** (tag_id, position tăng dần). Mặc định khi lọc đúng 1 tag và URL không có `sort`; các trường hợp khác mặc định vẫn là "Mới nhất".
- Nút **Đánh số lại** trong thanh công cụ, chỉ khi lọc đúng 1 tag; có xác nhận "Đánh số lại n ghi chú trong tag X theo thứ tự đang hiển thị?".
- Telegram: `✅ Đã lưu — Temp #3`; `/recent` hiện `Temp #3` thay `#id`.
- Widget: `Đã lưu — Temp #3` (đọc `tags[0].name` + `position` từ API; thiếu `position` thì hiện `Đã lưu`).
- Kéo sắp xếp: thả ra mới lưu (một request cho cả tag); đang lưu thì làm mờ danh sách; lỗi → báo đỏ và tải lại.

## 5. Xuất file

- Tham số `/api/export`: `num=0` bỏ số #, `detail=0` bỏ tag/ngày giờ/link (thay nghĩa cũ "chỉ còn #id").
- Dòng đầu mỗi ghi chú ghép từ các phần được bật: `#3` · `Temp` · `27/09/2026 14:05` · `link`. Không phần nào bật → không có dòng đầu, chỉ nội dung.
- Ngăn cách giữa các ghi chú: **một dòng trống** (TXT: `\n\n`; Word: khoảng cách đoạn, không kẻ viền).
- Hai ô tick trên thanh công cụ: **Kèm số #**, **Kèm tag, ngày giờ, link** — mặc định bật, nhớ trong `localStorage`.
- Xuất nhiều tag mà bỏ "Kèm tag…" thì số có thể trùng giữa các tag — chấp nhận.

## 6. API

- Kết quả `POST /api/notes`, `PUT /api/notes/:id/tags`: thêm `position`. `PUT` trả `{ id, tags, position }`.
- Server action mới: `moveNoteAction(id, tagId|null)`, `bulkMoveAction(ids, tagId|null)`, `renumberAction(tagId, orderedIds)`, `reorderAction(tagId, orderedIds)`.
  - `renumberAction`/`reorderAction` nhận danh sách id theo thứ tự mong muốn; server kiểm tra mọi id thuộc tag đó, gán 1…k cho chúng; ghi chú còn lại của tag (không có trong danh sách, vd do bộ lọc) được đánh tiếp k+1… theo thứ tự số cũ.

## 7. Kiểm thử

- Migration: dữ liệu nhiều tag → giữ 1 tag, số theo `created_at` trong từng tag; ghi chú không tag → tag mặc định.
- `moveNote`/`createNote`: max+1, tag rỗng → 1, chuyển vào chính tag → không đổi, id lạ → mặc định.
- `deleteTag`: nối tiếp cuối tag mặc định.
- `renumber`/`reorder`: 1…n, id không thuộc tag → lỗi, ghi chú ngoài danh sách đánh tiếp.
- Sort "Theo số #", mặc định khi lọc 1 tag.
- Telegram: chọn 1, cảnh báo nhiều hashtag, câu trả lời có `Tag #n`.
- Widget: `SetNoteTagsAsync` gửi đúng 1 tag; hiển thị `Tag #n`.
- Xuất: 4 tổ hợp `num`/`detail`, ngăn cách một dòng trống, Word không còn viền.
- Kéo sắp xếp: thử trên Edge headless.
