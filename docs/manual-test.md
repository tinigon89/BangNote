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
- [ ] Trang Tag: tạo, đổi tên, đổi màu, xoá; tạo trùng khác dấu bị chặn; tag mặc định không xoá được.
- [ ] Trang Cài đặt: đủ ✅ biến môi trường; webhook ✓ đúng.
- [ ] Mở trên điện thoại: bố cục không vỡ, không cuộn ngang.

## Bot Telegram
- [ ] Gửi text → "✅ Đã lưu #n" + bàn phím tag; web thấy ghi chú nguồn Telegram.
- [ ] Forward tin từ chat khác → lưu được.
- [ ] Ảnh có chú thích → lưu chú thích; ảnh không chú thích → "Chỉ hỗ trợ text".
- [ ] `#LichSu nội dung` → gắn tag Lịch sử, nội dung không còn hashtag.
- [ ] `nội dung #khongco` → lưu + cảnh báo "Không có tag #khongco".
- [ ] Chỉ gửi `#LichSu` → "Nội dung trống, không lưu".
- [ ] Bấm tag trên bàn phím → ✓ di chuyển đúng; bấm "Chưa phân loại" → bỏ hết tag thật.
- [ ] Bấm 🗑 Xoá → tin nhắn đổi thành "🗑 Đã xoá #n", web không còn ghi chú.
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
