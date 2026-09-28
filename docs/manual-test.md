# Checklist test tay

Chạy sau mỗi lần deploy lớn. Đánh dấu từng mục.

## Web admin
- [ ] Mở `/` khi chưa đăng nhập → chuyển tới `/login`; sai mật khẩu → "Sai mật khẩu"; đúng → vào trang ghi chú.
- [ ] Thêm nhanh không chọn tag → chip "Chưa phân loại".
- [ ] Tìm `lich su` ra ghi chú "Lịch sử…"; tìm `100%` chỉ ra ghi chú chứa đúng "100%".
- [ ] Lọc 2 tag → ra ghi chú có tag này HOẶC tag kia; lọc "Chưa phân loại" → chỉ ghi chú chưa gắn tag.
- [ ] Sửa nội dung, Copy, Xoá một ghi chú.
- [ ] Chọn nhiều → Chuyển tag; chọn nhiều → Xoá.
- [ ] "Tải thêm" xuất hiện khi > 50 ghi chú và tải thêm được.
- [ ] Sắp xếp Mới nhất / Cũ nhất / Mới sửa gần đây đổi thứ tự ngay khi chọn.
- [ ] Lọc thời gian: Hôm nay, Hôm qua, 7/30 ngày, Tháng này/trước, Chọn ngày, Chọn tháng, Tuỳ chọn (Từ–Đến); ghi chú lúc 23h thuộc đúng ngày theo giờ VN.
- [ ] Kéo chuột dọc cột ô chọn bên trái → chọn nhiều thẻ; kéo từ thẻ đang chọn → bỏ chọn; Shift+click chọn cả đoạn; kéo trên chữ vẫn bôi đen bình thường.
- [ ] Copy (n) chép nội dung các thẻ đã chọn, cách nhau một dòng trống.
- [ ] Xuất TXT / Xuất Word: không chọn gì → toàn bộ kết quả lọc; có chọn → chỉ các thẻ đã chọn; file Word mở được trong Word.
- [ ] Xuất với 4 tổ hợp "Kèm số #" / "Kèm tag, ngày giờ, link"; giữa các ghi chú chỉ một dòng trống; tải lại trang vẫn nhớ lựa chọn.
- [ ] Chip hiện `Tên tag #n`; bấm chip → chọn tag khác → ghi chú nhận số cuối dãy của tag mới.
- [ ] Lọc 1 tag → mặc định "Theo số #", có nút "Đánh số lại" và tay nắm ⠿; kéo ⠿ đổi thứ tự và số liền mạch.
- [ ] Sort "Cũ nhất" + "Đánh số lại" → số theo thời gian tạo.
- [ ] Xoá hết ghi chú trong một tag → ghi chú mới vào tag đó là `#1`.
- [ ] Trang Tag: tạo, đổi tên, đổi màu, xoá; tạo trùng khác dấu bị chặn; tag mặc định không xoá được.
- [ ] Trang Cài đặt: đủ ✅ biến môi trường; webhook ✓ đúng.
- [ ] Mở trên điện thoại: bố cục không vỡ, không cuộn ngang.

## Bot Telegram
- [ ] Gửi text → "✅ Đã lưu — Tag #n" + bàn phím tag; web thấy ghi chú nguồn Telegram.
- [ ] Forward tin từ chat khác → lưu được.
- [ ] Ảnh có chú thích → lưu chú thích; ảnh không chú thích → "Chỉ hỗ trợ text".
- [ ] `#LichSu nội dung` → gắn tag Lịch sử, nội dung không còn hashtag.
- [ ] `nội dung #khongco` → lưu + cảnh báo "Không có tag #khongco".
- [ ] Chỉ gửi `#LichSu` → "Nội dung trống, không lưu".
- [ ] Trả lời "✅ Đã lưu — Tag #n"; bấm tag khác → tin nhắn đổi thành tag mới + số mới; bấm tag hiện tại → không đổi.
- [ ] Gõ 2 hashtag → gắn tag đầu + cảnh báo "Chỉ gắn 1 tag".
- [ ] Bấm 🗑 Xoá → tin nhắn đổi thành "🗑 Đã xoá", web không còn ghi chú.
- [ ] `/tags`, `/recent` trả kết quả đúng.
- [ ] Tài khoản Telegram khác gửi text → bot im lặng; `/start` → chỉ trả ID.

## Extension
- [ ] Load unpacked không lỗi trên Chrome và Edge.
- [ ] Tuỳ chọn: URL có `/` cuối được chuẩn hoá; URL thiếu `https://` báo lỗi; "Kiểm tra kết nối" báo số tag.
- [ ] Menu chuột phải hiện đủ tag; tag tên có `&` hiển thị đúng.
- [ ] Lưu có tag / không tag; giữ xuống dòng; có link + tiêu đề trang.
- [ ] `Alt+Shift+S` lưu vào "Chưa phân loại"; không bôi đen gì → thông báo "Không có chữ nào được chọn".
- [ ] "↻ Làm mới danh sách tag" cập nhật tag mới tạo.
- [ ] Trang PDF: vẫn lưu được.
- [ ] Server tắt → badge đỏ + "Không kết nối được server"; key sai → "API key không hợp lệ".

## Widget Windows
- [ ] Lần đầu chạy tự mở Cài đặt; URL sai báo lỗi; "Kiểm tra" báo số tag.
- [ ] Kéo thả từ Chrome, Word, Notepad → "Đã lưu — Tag #n"; ghi chú nguồn Widget trên web.
- [ ] Hiện "Đã lưu — Tag #n"; bấm chip tag khác trong 5 giây → chuyển tag, nhãn đổi số.
- [ ] `Ctrl+V` khi widget đang được chọn → lưu clipboard.
- [ ] Kéo file (không phải text) → không nhận.
- [ ] Mất mạng → cam "đang chờ gửi"; có mạng lại → tự gửi trong ≤ 60 giây.
- [ ] Sai API key → đỏ, ghi chú vẫn được giữ; sửa key → được gửi.
- [ ] Vị trí widget được nhớ sau khi mở lại; chạy lần hai không mở thêm cửa sổ.
- [ ] Alt+Insert khi đang ở app khác → widget ẩn; bấm lại → hiện và được focus (Ctrl+V dùng được ngay).
- [ ] Khởi động cùng Windows bật/tắt được; Thoát xoá icon khay.
- [ ] `queue.json` hỏng → app vẫn chạy, có `queue.json.bad`.
