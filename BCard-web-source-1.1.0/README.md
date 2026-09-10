# BCard Web Mobile 1.1.0 — Danh bạ namecard 3D

Ứng dụng web mobile/PWA dựa trên `TU_VAN_APP_DANH_BA_THU_2.md`, dùng giao diện mobile-first 3D/clay, jQuery và OCR Tesseract Việt/Anh chạy cục bộ. Bản hiện tại lưu dữ liệu trên origin trình duyệt, phù hợp demo trước Core P0 Legal & Store Gate.

## Chạy ứng dụng

```powershell
npm ci
npm start
```

Mặc định mở `http://localhost:4173`. Giao diện hỗ trợ điện thoại nhỏ, điện thoại lớn, tablet, landscape, desktop, safe-area và dark mode.

## OCR và kiểm thử

OCR worker, model Việt/Anh và WebAssembly được đóng gói vào `www/vendor/tesseract/` khi build. Chạy bộ kiểm tra bằng:

```powershell
npm test
npm run check
npm run build
npm run test:ocr
npm run test:visual
```

Để đo trực tiếp một ảnh card thật trong trình duyệt:

```powershell
$env:CARD_IMAGE='C:\duong-dan\namecard.png'
npm run test:ocr-card
```

Theo yêu cầu bàn giao hiện tại, không tạo APK/AAB. Web assets nằm ở `www/`; Tesseract, model OCR, jQuery, Lucide và font Nunito/DM Sans đều được đóng gói cục bộ để không phụ thuộc CDN.

## Luồng có thể thử

- Chụp bằng camera web hoặc chọn ảnh hai mặt, xác nhận mặt sau trống, chạy OCR Việt/Anh, review và commit `LOCAL_ACCEPTED`.
- Ảnh được phóng đủ độ phân giải, chuyển xám và cân bằng tương phản trước khi OCR; parser ưu tiên nhãn Mobile, chức danh gần tên và loại slogan/địa chỉ/mã số thuế khỏi các trường liên hệ.
- Field Sự kiện là Creatable Combobox/Autocomplete: click để chọn từ dropdown, gõ để lọc hoặc tạo tên hoàn toàn mới. Giá trị mới được lưu tự động; sự kiện đang dùng vẫn được điền sẵn khi quét.
- Có thể lưu ngay ở trạng thái chưa xác nhận, mở lại card và hoàn tất “Xác nhận đã đối chiếu” sau; dữ liệu hiển thị mức xác nhận 100%, còn điểm OCR máy vẫn được lưu riêng.
- Ảnh đầu vào được kiểm tra loại/kích thước và tối ưu tối đa 2.000px trước khi lưu để giảm nguy cơ đầy bộ nhớ trình duyệt.
- Tìm danh bạ theo tên, công ty, số, email, tag, sự kiện và ghi chú; dữ liệu tồn tại qua lần tải trang sau.
- App shell được cache bằng service worker để có thể mở lại và tìm dữ liệu đã lưu khi offline.
- Dark mode, safe-area iOS/Android, mục tiêu chạm tối thiểu 44–48px, SVG icons và hiệu ứng card 3D có hỗ trợ `prefers-reduced-motion`.
- Xem hồ sơ hiện tại riêng với snapshot card, nhiều contact methods, nhiều quan hệ công ty và provenance từng giá trị.
- Sửa liên kết nhầm giữa card và contact mà không trộn dữ liệu; lịch sử gặp theo sự kiện vẫn được giữ để tìm/lọc offline.
- Search, copy và các chỉ mục hiển thị chỉ dùng method/relationship đang `ACTIVE`, không làm lộ lại giá trị `REVOKED`.
- Duyệt proposal có kiểm tra target hiện hành; proposal cũ bị supersede thay vì ghi đè dữ liệu mới hơn.
- Thêm ghi chú, gọi/email/mở website/sao chép; thao tác xóa card dọn ảnh/raw OCR cục bộ nhưng giữ trạng thái acceptance tối thiểu.
- Xem acceptance, sync object/version, lifecycle và incident độc lập; mô phỏng offline, backlog và sync.
- Xuất toàn bộ dữ liệu tài khoản dạng JSON, tạo yêu cầu quyền dữ liệu demo và đặt lại dữ liệu mẫu.

Đây là prototype front-end, chưa có camera/OCR native, backend đa tenant, object storage, auth, mã hóa, audit bất biến hoặc quy trình Data Subject Rights thật. Các phần đó cần technical discovery và gate pháp lý/store trước khi triển khai production hoặc dùng namecard thật.
