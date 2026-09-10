# BCard Web Mobile 1.1.0 — Báo cáo hoàn thiện

Ngày hoàn tất: 09/09/2026  
Demo: `http://localhost:4173`  
Phạm vi bàn giao: mã nguồn và bản build web mobile/PWA; không tạo APK hoặc AAB.

## Kết quả

BCard 1.1.0 chạy hoàn chỉnh trong simulator trình duyệt với giao diện mobile-first 3D, responsive và dark mode. Luồng chính đã được kiểm tra từ chọn/chụp ảnh, OCR Việt/Anh, review, lưu card, dò trùng, liên kết hồ sơ, duyệt ADD/UPDATE/REMOVE, tìm kiếm offline, xem snapshot, ghi chú, sự kiện, export và mô phỏng đồng bộ.

## Phần đã hoàn thành

- Camera web dùng `getUserMedia()` với camera sau làm mặc định; luôn có phương án chọn ảnh từ thiết bị.
- OCR thật bằng Tesseract.js 7, nạp model `vie+eng` từ bundle cục bộ, không gửi ảnh tới CDN hoặc dịch vụ OCR ngoài.
- Tiền xử lý ảnh tự tăng độ phân giải, chuyển xám và cân bằng tương phản. Parser ưu tiên số có nhãn Mobile, chọn tên theo vị trí/chức danh lân cận, loại slogan, địa chỉ và mã số thuế, đồng thời suy ra website từ tên miền email khi card không in website.
- Field Sự kiện trong form OCR là Creatable Combobox/Autocomplete: người dùng có thể click chọn trong dropdown, gõ để lọc hoặc tạo nội dung tùy ý. Tên mới được thêm vào danh sách sự kiện, lưu bền và trở thành sự kiện đang dùng; sự kiện hiện tại vẫn được tự điền khi quét.
- Lịch sử gặp theo sự kiện được lưu riêng trên contact; tìm kiếm, lọc và số người trong sự kiện dùng lịch sử này thay vì chỉ trường hiển thị gần nhất.
- Form review không tự điền dữ liệu mẫu. Người dùng có thể sửa trong lúc OCR chạy; kết quả OCR không ghi đè trường đã sửa.
- Form cho phép lưu trạng thái `UNCONFIRMED`, mở lại card và xác nhận sau; phone/email là tùy chọn đúng mô hình contact có 0..n methods. Ảnh đầu vào được kiểm tra và tối ưu kích thước trước khi lưu.
- Giao diện tách rõ chất lượng OCR tự động với mức xác nhận của người dùng. Sau khi người dùng đối chiếu ảnh và đánh dấu xác nhận, card được lưu với `reviewStatus: USER_CONFIRMED` và `reviewConfidence: 100`; điểm OCR gốc vẫn được giữ trung thực để audit.
- Mỗi Card giữ ảnh, raw OCR, ngôn ngữ, độ tin cậy, extracted values và correction của người dùng tách khỏi Contact hiện tại.
- Dò trùng theo họ tên chuẩn hóa, số điện thoại và email; card snapshot luôn được giữ riêng.
- Proposal ADD/UPDATE/REMOVE đều có đường đi UI và phải được người dùng duyệt. REMOVE chuyển dữ liệu sang REVOKED, không xóa vật lý và không hiển thị lẫn với ACTIVE.
- Proposal giữ target version/thời điểm, kiểm tra target trước khi áp dụng và chuyển `SUPERSEDED` nếu dữ liệu đích đã đổi. Card liên kết nhầm có thể chuyển sang contact đúng mà không merge field.
- Relink chuyển đúng encounter theo card; search/copy loại toàn bộ method và relationship `REVOKED`. Proposal tên và website cá nhân dùng `UPDATE` đúng target thay vì ghi đè ngầm.
- Xóa card dọn ảnh, raw OCR, extracted values và correction khỏi thiết bị, đồng thời giữ acceptance/lifecycle và bản tóm tắt purge tối thiểu.
- Lưu dữ liệu trên thiết bị có snapshot rollback khi mutation hoặc storage thất bại.
- Tìm kiếm, bộ lọc, xem danh bạ và app shell hoạt động offline. Service worker đóng gói app shell, worker OCR, model Việt/Anh và các biến thể WebAssembly để OCR tiếp tục chạy offline.
- CSP giữ nguyên nguyên tắc không dùng inline style; chỉ mở `wasm-unsafe-eval` cho WebAssembly cục bộ và `worker-src` cho OCR worker.
- UI dùng font Nunito/DM Sans, icon Lucide, semantic tokens, vùng chạm 44–48px, safe area, keyboard focus, reduced motion, contrast mode và breakpoint 320/390/1024.

## Kết quả kiểm thử

### Unit/integration

```text
tests 23
pass 23
fail 0
```

Bao phủ parser OCR, card AEON/All Made Viet hồi quy, chuẩn hóa và dò trùng, proposal ADD/UPDATE/REMOVE, validation trường tùy chọn, lưu/xác nhận review sau, rollback `QuotaExceededError`, attach/relink encounter không ghi đè hồ sơ, lọc dữ liệu REVOKED, chống stale proposal, purge payload khi xóa và lưu raw OCR/correction.

### OCR trên ảnh AEON do người dùng cung cấp

```text
Tên: NGUYEN MINH THUC
Chức danh: General Manager
Công ty: AEON TOPVALU VIETNAM COMPANY LIMITED
Điện thoại: 0938-638-881
Email: thuc.nguyen@aeontopvalu.com.vn
Website suy ra: aeontopvalu.com.vn
Điểm OCR thực tế: 85%
```

Sáu trường trên được nhận đúng trong Chrome bằng đúng pipeline trình duyệt. Đây là kết quả trên một mẫu thực tế, chưa phải tỷ lệ chính xác thống kê của một bộ benchmark lớn.

### OCR hai mặt card All Made Viet do người dùng cung cấp

- Họ và tên: Liney Weishappel
- Chức danh: CEO Co Founder
- Công ty: All Made Viet
- Điện thoại: +84 707849598
- Email: hello@allmadeviet.com
- Website: allmadeviet.com
- Điểm OCR thực tế: 90%

Hai mặt card được đọc cùng lúc trong Chrome. Form nhận đúng ba trường người dùng yêu cầu và cả điện thoại, email, website.

### OCR runtime trên Chrome

```text
OCR runtime PASS: vie+eng, confidence 94%, online/offline nhận đúng, CSP/worker/WASM sạch.
```

### Visual smoke

```text
Visual smoke PASS: 320/390/1024, CSP sạch, ảnh card đúng khung, combobox sự kiện creatable/keyboard, lưu chưa xác nhận, relink card, ADD/UPDATE/REMOVE và rollback.
```

### Build

```text
npm ci          PASS — 113 packages, 0 vulnerabilities
npm test        PASS — 23/23
npm run check   PASS
npm run build   PASS
```

Output đầy đủ nằm trong `audit-evidence-v1.1.0/`. Bằng chứng OCR runtime nằm ở `BCard_OCR_Runtime_Evidence_v1.1.0.json`; bằng chứng computed style nằm ở `BCard_ComputedStyle_Evidence_v1.1.0.json`.

## Chạy lại

```powershell
npm ci
npm test
npm run check
npm run build
npm run test:ocr
npm run test:visual
npm start
```

Sau đó mở `http://localhost:4173`.

## Giới hạn còn lại

- Dữ liệu nghiệp vụ hiện lưu trong `localStorage`; phù hợp demo cá nhân trên một origin trình duyệt nhưng chưa phải SQLite mã hóa hoặc secure storage.
- Chưa có backend production, tài khoản thật, tenant isolation, object storage riêng tư, ACK/idempotency/conflict resolution hoặc hàng đợi sync server.
- Trình phân tích field OCR dùng heuristic; người dùng vẫn phải review. Đã kiểm tra đúng card AEON và All Made Viet thực tế nhưng chưa có bộ dữ liệu benchmark namecard Việt/Anh đủ lớn để công bố độ chính xác.
- DSR, audit log, retention, consent, privacy policy và Legal & Store Gate chưa phải quy trình production đã được xác nhận.
- Vì các giới hạn trên, bản này GO cho demo trình duyệt bằng dữ liệu giả hoặc dữ liệu thử không nhạy cảm; vẫn NO-GO cho pilot namecard thật và production.
