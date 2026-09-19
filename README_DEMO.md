# BCard Web Mobile 1.1.0

Yêu cầu: Node.js 20 trở lên.

Chạy `START_BCARD_DEMO.cmd`, sau đó mở `http://localhost:4173`.

OCR Việt/Anh, font, icon và WebAssembly đã nằm trong thư mục `www`, nên demo không cần cài npm hoặc tải model từ CDN. Camera cần quyền của trình duyệt; nếu simulator không có camera, chọn ảnh từ máy.

Demo lưu dữ liệu trong origin trình duyệt hiện tại. Không dùng dữ liệu nhạy cảm hoặc namecard thật trước khi hoàn tất backend, mã hóa và Legal & Store Gate.

Demo 1.1.0 chưa có Company Research. Bản hoàn thiện production bắt buộc phải tự enqueue resolver/research doanh nghiệp có nguồn sau khi contact đủ điều kiện được lưu; không được coi demo này là bằng chứng tính năng đó đã hoàn thành.
