# Tổng quan project BCard và phạm vi production

> Cập nhật theo mã nguồn và tài liệu trong repository tại phiên bản `1.1.0`.

## 1. Tóm tắt ngắn

**BCard** là ứng dụng “danh bạ thứ hai” dành cho namecard. Người dùng chụp hoặc chọn ảnh hai mặt của namecard, ứng dụng dùng OCR Việt/Anh để trích xuất thông tin, cho người dùng kiểm tra lại rồi lưu thành hồ sơ liên hệ có kèm bối cảnh gặp gỡ.

Repository hiện tại là **prototype front-end có thể chạy được**, gồm web mobile/PWA và bộ khung đóng gói Android/iOS bằng Capacitor. Prototype dùng để trình diễn, kiểm tra UX, OCR, offline và một phần mô hình dữ liệu. Đây **chưa phải hệ thống production** và chưa được phép hiểu là đã sẵn sàng dùng namecard thật.

**Production P0** được định hướng là một sản phẩm mobile hoàn chỉnh có tài khoản thật, dữ liệu riêng cho từng người dùng, local database để dùng offline, backend để đồng bộ nhiều object/version, kho ảnh riêng tư, bảo mật, audit, backup/restore, quyền riêng tư và quy trình vận hành thực tế.

## 2. Project giải quyết vấn đề gì?

Namecard giấy thường bị thất lạc và thiếu bối cảnh sau khi gặp một người. BCard chuyển namecard thành dữ liệu có thể tìm lại và sử dụng:

- Lưu ảnh card như bằng chứng/snapshot lịch sử.
- Nhận dạng tên, chức danh, công ty, số điện thoại, email và website bằng OCR.
- Cho người dùng sửa hoặc xác nhận kết quả OCR trước hay sau khi lưu.
- Gắn người liên hệ với sự kiện, lần gặp, ghi chú và tag.
- Tìm kiếm theo tên, công ty, số điện thoại, email, tag, sự kiện hoặc ghi chú.
- Gọi điện, soạn email, mở website và sao chép thông tin từ hồ sơ.
- Làm việc với dữ liệu đã có ngay cả khi mất mạng.
- Giữ nguồn gốc của dữ liệu để phân biệt nội dung từ card, nội dung người dùng nhập và thay đổi về sau.

Giá trị cốt lõi cần kiểm chứng ở P0 là: **quét nhanh, tìm lại đúng người, nhớ đúng bối cảnh và sử dụng lại được thông tin liên hệ**.

## 3. Đối tượng và tình huống sử dụng

Đối tượng phù hợp là người thường xuyên nhận namecard tại hội nghị, networking, gặp khách hàng, đối tác hoặc nhà đầu tư.

Luồng sử dụng chính:

1. Người dùng mở BCard và chụp/chọn ảnh mặt trước, mặt sau của card.
2. Ảnh được kiểm tra, thu nhỏ về kích thước phù hợp và tiền xử lý trước OCR.
3. Tesseract nhận dạng tiếng Việt và tiếng Anh ngay trên thiết bị.
4. Ứng dụng đề xuất các trường tên, chức danh, công ty, điện thoại, email và website.
5. Người dùng sửa, chọn sự kiện, thêm ghi chú và xác nhận; cũng có thể lưu ở trạng thái chưa xác nhận để kiểm tra sau.
6. Hệ thống tạo card snapshot và tạo mới hoặc liên kết với contact đã có.
7. Nếu card mới chứa dữ liệu khác hồ sơ hiện tại, hệ thống tạo đề xuất thay đổi thay vì tự ghi đè.
8. Người dùng tìm lại contact, xem card gốc, lịch sử gặp và thực hiện các thao tác liên hệ cơ bản.

## 4. Bản hiện tại trong repository đang làm được gì?

### 4.1. Trải nghiệm người dùng

- Giao diện mobile-first, responsive cho điện thoại, tablet và desktop.
- Có dark mode, safe area, keyboard focus, reduced motion và vùng chạm phù hợp mobile.
- Các màn hình chính: tổng quan, danh bạ, card, sự kiện, đồng bộ mô phỏng, quyền riêng tư và tài khoản.
- Camera web qua `getUserMedia()` và phương án chọn ảnh từ thiết bị.
- Quét một hoặc hai mặt; có thể xác nhận mặt sau trống.
- Form review không ghi đè nội dung người dùng đã sửa trong lúc OCR đang chạy.
- Có thể lưu hồ sơ chưa xác nhận rồi mở lại để xác nhận sau.
- Dò contact có khả năng trùng và hỗ trợ liên kết/relink card mà không merge dữ liệu ngầm.
- Hỗ trợ proposal `ADD`, `UPDATE`, `REMOVE`; proposal cũ bị `SUPERSEDED` nếu target đã thay đổi.
- Tìm kiếm, lọc, xem dữ liệu, gọi/email/mở website/copy và xuất JSON.

### 4.2. OCR và offline

- OCR thật bằng Tesseract.js với model `vie+eng`.
- Worker, WebAssembly và model ngôn ngữ được bundle cục bộ, không cần CDN hay dịch vụ OCR bên ngoài.
- Ảnh được tăng độ phân giải khi cần, chuyển xám và cân bằng tương phản.
- Parser dùng heuristic để nhận dạng các trường; ưu tiên số có nhãn Mobile, loại một số dòng slogan/địa chỉ/mã số thuế và có thể suy ra website từ domain email.
- Service worker cache app shell và OCR runtime để ứng dụng có thể mở lại, tìm kiếm và chạy OCR offline sau khi tài nguyên đã được cache.

### 4.3. Cách lưu dữ liệu hiện tại

- Dữ liệu nghiệp vụ, Blob ảnh, object cache và pending queue được lưu theo account trong IndexedDB; `localStorage` chỉ còn migration một lần cho dữ liệu prototype cũ.
- Khi có cấu hình public Supabase, Auth/PostgreSQL/RLS/private Storage và RPC `sync_object` xử lý backend thật. Khi thiếu cấu hình, app báo local-development rõ ràng và không giả sync/research thành công.
- Queue đồng bộ theo object/version/idempotency, dependency, retry/backoff, conflict và remote-visibility evidence. Lifecycle mới supersede payload cũ trong cùng transaction.
- Native refresh token dùng Keychain/Android Keystore qua Token Vault; browser session chỉ ở memory.
- Xuất dữ liệu chỉ theo account hiện tại. Xóa card dọn ảnh/raw OCR/PII cục bộ, không upload content chưa từng dispatch, và tách delete propagation khỏi lịch sử content sync.

### 4.4. Các trạng thái nghiệp vụ hiện dùng

BCard cố ý tách bốn chiều trạng thái, không gộp thành một `status` chung:

| Chiều trạng thái | Trả lời câu hỏi |
|---|---|
| Acceptance | Ứng dụng đã tiếp nhận bền dữ liệu trên thiết bị chưa? |
| Sync | Object/version cụ thể đã được server xác nhận chưa? |
| Lifecycle | Dữ liệu còn active, bị hạn chế hay đã xóa? |
| Incident | Có sự cố mất dữ liệu, bảo mật hoặc xử lý bất thường không? |

`LOCAL_ACCEPTED` là mốc ứng dụng xác nhận đã tiếp nhận card trên thiết bị. Trong production, từ mốc này hệ thống phải chịu trách nhiệm tiếp tục đồng bộ hoặc ghi nhận rõ lý do không thể xử lý.

### 4.5. Công nghệ hiện tại

| Thành phần | Công nghệ/vai trò |
|---|---|
| UI | HTML, CSS, JavaScript và jQuery |
| Icon/font | Lucide, Nunito và DM Sans bundle cục bộ |
| OCR | Tesseract.js 7, model Việt/Anh, WebAssembly |
| Offline web | PWA manifest và service worker |
| Build | Script Node.js copy source và dependencies vào `www/` |
| Demo server | HTTP static server tại cổng mặc định `4173` |
| Mobile wrapper | Capacitor với project Android và iOS |
| Kiểm thử | Node test runner và Playwright Core cho smoke test |

## 5. Phần engineering đã triển khai và gate còn lại

Repository hiện đã có core P0, backend Supabase, offline sync hardening và Company Research có nguồn ở mức code/test để đưa vào controlled staging bằng dữ liệu giả. Điều này chưa thay thế Legal & Store Gate, staging credential, device validation, backup/restore hoặc incident ownership.

### 5.1. Ứng dụng mobile

- Camera/OCR, review, danh bạ, card, sự kiện, ghi chú và basic contact actions.
- Local database/index theo tài khoản thay cho `localStorage`.
- Lưu bền card, ảnh và thao tác pending để không mất khi app đóng hoặc thiết bị mất mạng.
- Tìm kiếm offline trên dữ liệu thật đã tải về và dữ liệu đang chờ đồng bộ.
- Queue theo từng object/version, retry idempotent và xử lý dependency giữa các object.
- Token/khóa nằm trong secure storage của hệ điều hành; ảnh, database, index, temp và backup áp dụng chính sách bảo vệ đã được review.
- Đăng xuất/chuyển tài khoản không làm lộ dữ liệu hoặc gán nhầm queue giữa hai tài khoản.

### 5.2. Backend và dữ liệu server

- Xác thực, quản lý phiên và phân quyền theo tài khoản/tenant.
- Backend kiểm tra quyền ở mọi thao tác đọc, tìm, sửa, xóa, export và tải ảnh.
- Database lưu contact, contact method, card snapshot/OCR, quan hệ người–công ty, encounter, note, proposal, provenance và trạng thái/version.
- Object storage riêng tư lưu ảnh hai mặt và thumbnail; ảnh được liên kết đúng card/manifest/version.
- API đồng bộ từng object/version, ACK độc lập, chống duplicate và chống stale write ghi đè dữ liệu mới.
- Lifecycle action như xóa/hạn chế được ưu tiên để queue cũ không hồi sinh dữ liệu.
- Backup, restore, monitoring, rate/resource limit và quy trình xử lý sự cố.

### 5.3. Mô hình dữ liệu cốt lõi

- **Card** là snapshot lịch sử của một lần quét: ảnh, raw OCR, normalized values, correction, ngày quét và provenance.
- **Contact** là hồ sơ người hiện tại; không dùng card cũ để tự động ghi đè trạng thái hiện tại.
- **ContactMethod** cho phép `0..n` số điện thoại/email cùng active, có label, lifecycle, nguồn và version riêng.
- **TenantCompany** là công ty riêng trong phạm vi tài khoản, chưa phải kho công ty dùng chung giữa các tenant.
- **ContactCompany** mô tả quan hệ người–công ty; có thể có nhiều quan hệ active đồng thời.
- **Encounter** lưu lần gặp/sự kiện; **Note** và **Tag** hỗ trợ ghi nhớ, tìm kiếm.
- **UpdateProposal** chứa đề xuất `ADD/UPDATE/REMOVE` nhắm đúng value hoặc relationship, cần người dùng duyệt.
- **Provenance/lineage** cho biết mỗi giá trị hiện tại đến từ card nào, người dùng nhập hay nguồn hợp lệ khác.

### 5.4. Tự động tìm thông tin doanh nghiệp

- Sau khi contact được lưu/xác nhận và có company candidate, hệ thống tự enqueue Company Research mà không cần người dùng bấm lần đầu.
- Resolver ưu tiên official website, business email domain, tên và địa chỉ; trường hợp mơ hồ phải trả `unresolved`, không tự chọn bừa.
- Research chạy server-side, dùng nguồn web phù hợp và trả structured company facts có source URL, title và thời điểm truy cập.
- Hiển thị tên công ty, website chính thức, tóm tắt, ngành, sản phẩm/dịch vụ, khách hàng mục tiêu, thị trường, trụ sở, quy mô và public company contacts khi có bằng chứng.
- Tách rõ personal contact trên card với public company contact; không biến mobile/email cá nhân thành company fact.
- Cache theo resolved domain/company, có TTL, manual refresh và chống tạo job trùng.
- Auto research failure không làm lỗi hoặc rollback việc lưu card/contact.
- Người dùng có thể tắt auto research cho lần lưu tiếp theo; capability vẫn phải tồn tại và manual research/refresh vẫn hoạt động.

### 5.5. Quyền riêng tư, pháp lý và vận hành

Production không chỉ là đưa web lên một hosting công khai. Trước khi chạy pilot với namecard thật cần hoàn tất **Core P0 Legal & Store Gate**, tối thiểu gồm:

- Xác định vai trò, mục đích và căn cứ xử lý dữ liệu của người dùng app và người có tên trên card.
- Data map bao phủ ảnh, OCR, database, local index/cache, queue, export, backup và audit metadata.
- Chính sách privacy, retention, xóa/hạn chế và xử lý derived data theo lineage.
- Data Subject Rights Capability: tiếp nhận, xác minh, tìm phạm vi dữ liệu, review, hành động, audit và phản hồi.
- Store review strategy, permission disclosure và nội dung khai báo Android/iOS.
- Threat model, tenant isolation, mã hóa khi truyền/lưu, key management, logging có che PII và kiểm soát admin/support.
- Quy trình incident, backup/restore test, giám sát và bằng chứng nghiệm thu.

## 6. Trạng thái hiện tại và external gate

| Hạng mục | Đã triển khai/kiểm thử cục bộ | Cần xác minh ngoài repository |
|---|---|---|
| Dữ liệu | IndexedDB account-scoped + PostgreSQL migrations | Staging migration/restore exercise |
| Tài khoản | Supabase email/password, session isolation, native secure token adapter | Credential staging và test thiết bị thật |
| Đồng bộ | Queue, RPC, ACK, idempotency, dependency, reconciliation và durable conflict | Soak/network testing trên staging |
| Ảnh | Local Blob + private owner-only Storage flow | Lifecycle E2E với bucket staging |
| Offline | Pending bền, delete-before-sync supersession, pull/restore provenance | OS backup/restore và reinstall matrix |
| OCR | Tesseract.js chạy cục bộ | OCR on-device đã benchmark trên tập card pilot |
| Mobile | Web/PWA + bộ khung Capacitor | App Android/iOS được kiểm thử, ký, phát hành và qua store gate |
| Bảo mật | RLS, direct-DML lockdown, secure native token, private Storage, secret boundary và CI tests | Threat model review và monitoring ownership |
| Privacy/DSR | Account request + verified case/operator/match/action/audit schema, server RPC và operator runbook | Legal approval, retention decision và staging rehearsal |
| Company Research | Tenant-bound resolver/research, atomic quotas, cache, sources và personal-contact filter | Live provider quality/cost evaluation |
| Vận hành | CI, docs và fake-data staging boundary | Backup/restore, alert, incident và support ownership |

## 7. Những gì không thuộc bản hoàn thiện

Company Research tự động thuộc phạm vi bắt buộc. Các chức năng mở rộng sau vẫn không thuộc bản hoàn thiện hiện tại:

- Canonical company dùng chung giữa nhiều tài khoản.
- Tự động giải mã QR/vCard.
- Ghi dữ liệu sang danh bạ điện thoại.
- Tích hợp Zalo/WhatsApp hoặc tự gửi lời mời/tin nhắn.
- Reminder, message template và workflow chăm sóc quan hệ.
- Billing/subscription và quota thương mại.
- Full merge/undo contact, identity engine, graph cá nhân hoặc tìm kiếm ngữ nghĩa.
- AI cá nhân hóa, quét nhiều card trong một ảnh và sản phẩm thống kê bên ngoài.

## 8. Trạng thái sẵn sàng hiện tại

### Có thể dùng cho

- Demo nội bộ hoặc demo trình duyệt.
- Thử UX bằng dữ liệu giả/không nhạy cảm.
- Kiểm tra OCR trên một số card mẫu có sự đồng ý phù hợp.
- Technical discovery, lập specification, estimate và chuẩn bị pilot.

### Chưa nên dùng cho

- Pilot với kho namecard thật.
- Phát hành production cho người dùng bên ngoài.
- Cam kết dữ liệu đã được đồng bộ/backup trên server.
- Cam kết tenant isolation, secure storage, retention, DSR hoặc compliance hoàn chỉnh.

Kết luận hiện tại: **GO cho controlled staging bằng dữ liệu giả sau khi migrations/Edge Functions được triển khai và kiểm tra; NO-GO cho production và pilot namecard thật cho đến khi staging validation, security review và Core P0 Legal & Store Gate hoàn tất.**

## 9. Cấu trúc repository quan trọng

| File/thư mục | Mục đích |
|---|---|
| `index.html`, `styles.css` | App shell và giao diện |
| `app.js` | State, render UI và điều phối các luồng nghiệp vụ web/mobile |
| `logic.js` | Chuẩn hóa dữ liệu, dò trùng và logic proposal/contact |
| `ocr.js` | Tiền xử lý ảnh, chạy Tesseract và parse field |
| `sw.js`, `manifest.json` | PWA/offline cache và metadata cài đặt web app |
| `build.js` | Tạo web bundle tự chứa trong `www/` |
| `server.js` | Static server phục vụ demo local |
| `www/` | Build output dùng cho web demo và Capacitor |
| `android/`, `ios/` | Project native wrapper do Capacitor quản lý |
| `test/` | Unit, OCR và visual smoke tests |
| `audit-evidence-v1.1.0/` | Kết quả kiểm thử đã lưu của bản 1.1.0 |
| `TU_VAN_APP_DANH_BA_THU_2.md` | Product/technical/legal specification mục tiêu |
| `BCard_Final_Web_Report_v1.1.0.md` | Báo cáo hoàn thiện prototype web |

## 10. Chạy project hiện tại

Yêu cầu Node.js 20 trở lên.

```powershell
npm ci
npm test
npm run check
npm run build
npm start
```

Sau đó mở `http://localhost:4173`.

Các lệnh mobile hiện có:

```powershell
npm run mobile:sync
npm run android
npm run ios
```

`npm run android` cần Android toolchain. `npm run ios` cần môi trường macOS/Xcode để build và ký ứng dụng iOS.

## 11. Kết luận

BCard hiện có luồng **chụp namecard → OCR trên thiết bị → review → local acceptance → tìm offline → sync theo object/version → Company Research có nguồn** cùng các kiểm soát hardening trong repository.

Wording tối đa ở trạng thái này là: **Engineering hardening completed; ready for controlled staging validation with fake data** sau khi toàn bộ regression và database tests có bằng chứng. Chưa được gọi production-ready, compliant, store-approved hoặc sẵn sàng pilot namecard thật khi external gate chưa đạt.
