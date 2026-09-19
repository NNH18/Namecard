# BCard Web Mobile 1.1.0 — Báo cáo lịch sử

> Tài liệu này chỉ ghi nhận mốc prototype web 1.1.0 và không phải bằng chứng cho trạng thái hardening hiện tại. Bằng chứng OCR từng dùng danh thiếp thật đã được loại khỏi repository để tránh lưu PII. Xem `docs/HARDENING_REPORT.md`, `docs/TEST_EVIDENCE.md` và `docs/PRODUCTION.md` cho trạng thái hiện hành.

Ngày mốc prototype: 09/09/2026
Phạm vi: web mobile/PWA; không tạo APK hoặc AAB.

Prototype đã chứng minh luồng camera/chọn ảnh, OCR Việt/Anh cục bộ, review, lưu card, dò trùng, liên kết hồ sơ, ADD/UPDATE/REMOVE, tìm kiếm offline, dark mode, responsive và Creatable Combobox cho trường Sự kiện.

Các số liệu test, ảnh chụp và đầu ra OCR cũ không còn được dùng làm bằng chứng vì không gắn với commit hardening hiện tại hoặc chứa dữ liệu từ danh thiếp người dùng. Test hiện hành chỉ dùng fixture tạo giả với miền `example.test` và số điện thoại giả.

Trạng thái kiến trúc hiện hành đã chuyển sang IndexedDB theo tài khoản, Supabase Auth/PostgreSQL/RLS/private Storage, sync theo object/version, idempotency, reconciliation, provenance và Company Research server-side. Đây vẫn chỉ là mã nguồn dành cho controlled staging với dữ liệu giả. Legal & Store Gate, staging validation, native device testing, backup/restore và incident ownership vẫn là gate độc lập.
