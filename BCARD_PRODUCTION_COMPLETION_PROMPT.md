# BCard — Production Completion Prompt

Hoàn thiện toàn bộ project BCard trong repository hiện tại thành một MVP production-ready có thể chạy pilot có kiểm soát.

> Đây là tài liệu giao việc và tiêu chí nghiệm thu, không phải bằng chứng repository hiện đã production-ready. Chỉ được tuyên bố hoàn thành sau khi code, migrations, cấu hình, kiểm thử và các gate bắt buộc thực sự đạt.

## 0. Bối cảnh và mục tiêu

BCard là ứng dụng “danh bạ thứ hai” dành cho namecard, với luồng cốt lõi:

```text
Chụp/chọn ảnh hai mặt
→ OCR Việt/Anh trên thiết bị
→ Người dùng review/chỉnh sửa
→ Lưu card snapshot và contact
→ Tìm kiếm offline
→ Đồng bộ an toàn lên server
→ Xem lại, ghi chú và sử dụng thông tin liên hệ
```

Repository hiện đã có prototype web/PWA bằng HTML, CSS, JavaScript và jQuery; OCR cục bộ bằng Tesseract.js; service worker; test; build output `www/`; và wrapper Capacitor cho Android/iOS.

Mục tiêu của lần triển khai này là thay persistence/sync mô phỏng bằng hệ thống production dùng Supabase, giữ nguyên các business rule đang hoạt động, bổ sung authentication, offline queue, private image storage, tenant isolation, security, audit tối thiểu và **Company Research tự động bắt buộc** nhưng tách khỏi core scan/save.

Đọc và tuân thủ các tài liệu hiện có:

- `README.md`
- `TONG_QUAN_PROJECT_VA_PRODUCTION.md`
- `TU_VAN_APP_DANH_BA_THU_2.md`
- `BCard_Final_Web_Report_v1.1.0.md`
- `design-system/memento-mobile/MASTER.md`

Nếu yêu cầu trong prompt này khác tài liệu cũ, áp dụng thứ tự ưu tiên:

1. Bảo mật, quyền riêng tư và không làm mất dữ liệu.
2. Prompt này đối với công nghệ và phạm vi release đã chốt.
3. Business rule trong `TU_VAN_APP_DANH_BA_THU_2.md`.
4. Hành vi prototype hiện tại.

## 1. Working Rules

- Tự đọc toàn bộ source code, README, tài liệu thiết kế, test và cấu hình liên quan trước khi sửa.
- Không rewrite framework/frontend nếu không thật sự cần.
- Giữ UI, OCR, PWA, Capacitor và business logic đang hoạt động.
- Ưu tiên thay đổi nhỏ, code rõ ràng, ít dependency và dễ bảo trì.
- Không gọi Supabase trực tiếp rải rác trong UI.
- Không để mock, placeholder, fake success hoặc TODO trong luồng production chính.
- Không giả vờ đã sync/upload/research thành công khi external service trả lỗi.
- Không commit secret, credential thật, dữ liệu namecard thật hoặc PII trong fixture/log.
- Không tự merge dữ liệu làm mất provenance.
- Không tự mở rộng thành CRM, mạng xã hội hoặc research platform phức tạp.
- Tự chạy test/build/check và sửa mọi lỗi do thay đổi mới gây ra.
- Với phần không thể chạy end-to-end vì thiếu credential hoặc external project, vẫn phải hoàn thiện code, migration, validation, test bằng local harness/mocks ở boundary và tài liệu cấu hình; báo rõ blocker cuối cùng.

## 2. Kiến trúc production đã chọn

Dùng Supabase cho:

- PostgreSQL.
- Email/password Auth.
- Private Storage cho ảnh namecard.
- Row Level Security (RLS).
- Edge Functions cho server-side company research và logic cần secret.

Luồng persistence mục tiêu:

```text
UI
→ Repository/Data Layer
→ Local database/cache + pending queue
→ Supabase API/Storage
```

Nguyên tắc:

- Client dùng public anon/publishable key theo cơ chế chính thức của Supabase.
- Mọi authorization dựa trên authenticated user tại server/RLS, không tin `user_id` do client tự khai.
- Service-role key, OpenAI key và mọi server secret không được đưa vào web bundle, mobile assets, local storage, log hoặc Git.
- Stable ID được tạo từ client trước khi lưu offline để retry không tạo record trùng.
- Mỗi object có version/sync metadata riêng; không dùng trạng thái của Card đại diện cho Contact, Note, Image hoặc object khác.

## 3. Backend và database

Tạo migrations có version và có thể chạy lại trên một Supabase project mới.

Schema tối thiểu:

- `profiles`
- `contacts`
- `contact_methods`
- `tenant_companies`
- `contact_companies`
- `cards`
- `card_images`
- `events`
- `encounters`
- `notes`
- `tags` và bảng liên kết khi cần
- `update_proposals`
- provenance/lineage tương đương `field_provenance`
- `sync_operations` hoặc sync metadata tương đương
- `data_requests`/audit tối thiểu theo phạm vi release
- `company_resolution`
- `company_research`
- `company_facts`
- `research_sources`

Yêu cầu schema:

- Tất cả dữ liệu private có `owner_id`/account boundary rõ ràng.
- Foreign key không cho liên kết object của hai owner khác nhau.
- Timestamp, lifecycle, version và soft-delete/tombstone dùng nhất quán.
- Phone/email là collection `0..n`, không lặp lại thành source-of-truth thứ hai trong `contacts`.
- Company website thuộc `tenant_companies`; personal website thuộc contact/value thích hợp.
- Card là snapshot của lần scan, không tự thay đổi theo hồ sơ contact hiện tại.
- Card front/back là record riêng có path, checksum, size, content type, version và trạng thái upload.
- Nhiều quan hệ người–công ty có thể cùng `ACTIVE`.
- Update proposal nhắm đúng object/value/relationship và target version.
- Provenance truy được source card/user input tới value hiện tại.
- Index, constraint và uniqueness phục vụ truy vấn thật; không tạo duplicate khi cùng idempotency key được retry.

Migrations phải bao gồm:

- Tables, enum/check constraints cần thiết.
- Primary key, foreign key, unique constraint và index.
- Trigger/function cập nhật `updated_at` hoặc version nếu sử dụng.
- RLS enable cho toàn bộ private tables.
- Owner-based policies cho `SELECT`, `INSERT`, `UPDATE`, `DELETE`.
- Storage bucket private và storage policies.
- Seed chỉ chứa dữ liệu giả nếu thực sự cần cho development.

## 4. Authentication

Hoàn thiện:

- Email/password sign up.
- Sign in.
- Sign out.
- Session restore khi mở lại app.
- Auth loading state.
- Validation và error state dễ hiểu.
- Protected app state: chưa đăng nhập không đọc được danh bạ.
- Chuyển account phải khóa/dọn đúng cache đã sync và cách ly pending theo owner.
- Session hết hạn phải chuyển operation sang trạng thái cần auth, không âm thầm xóa pending.
- Logout phải dừng dispatch mới, xóa token khỏi memory/storage phù hợp và không để callback cũ cập nhật UI account mới.

Không cần social login trong release này.

## 5. Data layer

Tạo module rõ ràng, có thể điều chỉnh tên theo repository:

```text
lib/
├── config.js
├── supabase.js
├── auth.js
├── local-db.js
├── repository.js
├── storage.js
├── sync.js
├── company-resolver.js
└── company-research.js
```

Trách nhiệm:

- `config`: đọc và validate public environment/configuration.
- `supabase`: khởi tạo client duy nhất, không chứa secret.
- `auth`: session lifecycle và auth events.
- `local-db`: local database/cache, migration và pending queue.
- `repository`: API nghiệp vụ cho UI, không để UI biết chi tiết Supabase.
- `storage`: chuẩn hóa path, upload/download/delete ảnh private và retry.
- `sync`: dependency, dispatch, ACK, retry, conflict và reconcile.
- `company-resolver`: tạo candidate và quyết định resolved/unresolved.
- `company-research`: gọi Edge Function, validate trạng thái/result/cache.

Không phá API của `logic.js` và `ocr.js` nếu không cần. Nếu phải đổi, thêm adapter và test hồi quy.

## 6. Local persistence, offline và sync

Thay `localStorage` nghiệp vụ bằng local database phù hợp với web/PWA và Capacitor, ưu tiên IndexedDB ở web qua một abstraction nhỏ. Không lưu ảnh production dạng base64 trong row nghiệp vụ nếu có thể lưu Blob/file reference trong app-private storage.

App phải hỗ trợ:

- Đọc dữ liệu đã có khi offline.
- Tạo và sửa dữ liệu khi offline.
- Card/image đã `LOCAL_ACCEPTED` vẫn tồn tại sau refresh/restart.
- Pending operation queue theo account, object, object ID và version.
- Tự động sync khi online trở lại.
- Manual sync/retry có trạng thái rõ ràng.
- Exponential backoff có giới hạn hợp lý.
- Idempotency, không duplicate record hoặc upload.
- Dependency: parent được sync trước dependent hoặc server defer có kiểm soát.
- Reconcile sau crash, refresh, login lại và reconnect.
- Lifecycle delete/restrict ngăn queue cũ hồi sinh dữ liệu.
- Cache/index không trả lại value `REVOKED`, `RESTRICTED` hoặc `DELETED`.

Sync metadata có thể gồm:

```text
id
owner_id
object_type
object_id
object_version
operation_type
idempotency_key
sync_status
attempt_count
last_error_code
next_retry_at
server_ack_version
created_at
updated_at
```

Conflict MVP:

- Dùng optimistic concurrency theo object/version.
- Server kiểm expected version.
- Stale write không được âm thầm last-write-wins.
- Giữ thay đổi local để reload/reapply hoặc đưa người dùng review đơn giản.
- Không xây CRDT, realtime collaboration hay merge engine phức tạp.

Acceptance, sync, lifecycle và incident phải tiếp tục là bốn chiều độc lập.

## 7. Namecard image storage và OCR

Giữ OCR local bằng Tesseract.js và pipeline hiện có:

```text
camera/file
→ validate image
→ resize/preprocess
→ local OCR vie+eng
→ user review/edit
→ LOCAL_ACCEPTED
→ save card/contact locally
→ upload private image
→ sync database objects
→ receive ACK per object/version
```

Ảnh mặt trước/sau:

- Lưu trên Supabase private Storage.
- Database chỉ lưu path và metadata cần thiết.
- Storage path có owner/account boundary và stable card/image ID.
- Chỉ owner hoặc server role được phép phù hợp mới đọc.
- Dùng signed URL ngắn hạn hoặc authenticated download; không biến bucket thành public.
- Có checksum/idempotency để retry không upload trùng.
- Có trạng thái upload độc lập cho từng ảnh.
- Download/cache cho phép xem lại card theo policy offline.
- Xóa/hạn chế phải xử lý cả original, thumbnail, cache và derived data trong scope.
- Không upload ảnh nếu lifecycle action hợp lệ đã supersede content upload.

Giữ các hành vi OCR hiện có:

- Quét hai mặt và xác nhận mặt sau trống.
- OCR Việt/Anh chạy trên thiết bị.
- Không ghi đè field người dùng đã sửa khi OCR hoàn tất muộn.
- Cho phép lưu chưa xác nhận.
- Giữ raw OCR, confidence máy, extracted values và user corrections tách biệt.
- User confirmation 100% không được sửa giả confidence gốc của OCR.
- OCR lỗi không làm mất ảnh/card đã được local accepted.

## 8. Business logic phải được bảo toàn

Không làm mất hoặc làm sai:

- Card snapshot lịch sử.
- Contact và `0..n` contact methods.
- Nhiều company/title relationships cùng active.
- Event, encounter, notes và tags.
- Search theo tên, công ty, phone, email, tag, sự kiện và ghi chú.
- Duplicate suggestion.
- Attach card vào contact hiện có.
- Relink card/encounter mà không merge field.
- Proposal `ADD`, `UPDATE`, `REMOVE`.
- Proposal stale chuyển `SUPERSEDED` thay vì ghi đè target mới.
- `ACTIVE`, `REVOKED`, `RESTRICTED`, `DELETED` và lifecycle tương đương.
- Provenance/lineage theo từng value hoặc relationship quan trọng.
- Call, email, website và copy.
- Export dữ liệu tài khoản.

Card mới có dữ liệu khác contact hiện tại phải tạo proposal khi business rule yêu cầu. Không tự động thay số điện thoại/email, chức danh hoặc công ty hiện tại.

## 9. Search và dữ liệu hiển thị

- Search mặc định đọc local index/cache để hoạt động offline.
- Chỉ index value/relationship được phép hiển thị và còn active.
- Update index cùng transaction logic local hoặc có cơ chế repair/rebuild an toàn.
- Account A không tìm thấy dữ liệu của account B sau logout/login/chuyển account.
- Kết quả pending local xuất hiện nếu đã được tiếp nhận bền.
- Server search nếu có chỉ là bổ sung, không làm core offline search phụ thuộc mạng.
- Primary phone/email/company chỉ là presentation pointer, không phải source-of-truth thứ hai.

## 10. Company Research tự động — phạm vi bắt buộc

Company Research là điều kiện bắt buộc để hoàn thành release này. Module phải tự tìm, đối chiếu và hiển thị thông tin doanh nghiệp sau khi contact/company đủ điều kiện được lưu; không được hạ thành tùy chọn P1, demo, placeholder hoặc chỉ có nút bấm chưa nối backend. Research vẫn tách khỏi core scan/save để lỗi resolver, nguồn web, model hoặc network không làm mất card/contact.

```text
Tenant Company
→ Company Resolver
→ Resolved Company Candidate
→ Server-side Web Research
→ Verified Company Facts
→ Sources
```

Yêu cầu:

- Tự động enqueue research sau khi contact đã lưu/xác nhận và có company candidate tối thiểu; không yêu cầu người dùng bấm nút để bắt đầu lần đầu.
- Có nút `Nghiên cứu doanh nghiệp` để chạy thủ công khi auto research đang tắt, ca trước `failed`/`unresolved`, hoặc người dùng muốn thử lại.
- Có setting Auto Research, mặc định bật trong production configuration; người dùng có thể tắt cho các lần lưu tiếp theo mà không làm mất kết quả đã có.
- Auto Research phải có disclosure/consent và data-minimization phù hợp với kết luận Legal & Store Gate trước khi xử lý dữ liệu thật.
- Auto Research là capability bắt buộc; setting chỉ kiểm soát trigger tự động, không loại bỏ resolver, research UI, cache hoặc manual refresh khỏi sản phẩm.
- Research chạy bất đồng bộ; failure không làm lỗi lưu card/contact.
- Không copy dữ liệu private trên card thành public company fact.
- Không tạo shared people graph hoặc chia sẻ contact giữa các tenant.
- Cache research có thể dùng theo resolved domain/company; tenant link vẫn giữ riêng.
- Người dùng thấy rõ dữ liệu cá nhân và dữ liệu công khai của công ty là hai nhóm khác nhau.

## 11. Company Resolver

Resolver tạo candidate từ dữ liệu tối thiểu cần thiết, theo ưu tiên:

1. Official website in trên card.
2. Domain của business email.
3. Company name + address.
4. Company name + public web evidence.

Không resolve chỉ bằng một tên phổ biến khi còn ambiguity.

Output tối thiểu:

```json
{
  "status": "resolved | unresolved",
  "company_name": "",
  "domain": "",
  "website": "",
  "confidence": 0,
  "reason": ""
}
```

Rules:

- Confidence không đủ thì trả `unresolved`.
- Không tự chọn candidate đầu tiên.
- Normalize URL/domain và chặn scheme/host nguy hiểm.
- Không dùng free-email domain làm bằng chứng company duy nhất.
- Lưu evidence/reference tối thiểu để giải thích quyết định.
- Resolver có test cho ambiguity, free email, domain hợp lệ và unresolved.

## 12. Company Research Engine

Research chạy server-side bằng Supabase Edge Function. OpenAI API chỉ được gọi từ server-side function.

Dùng model cấu hình bằng environment variable. Input chỉ gồm thông tin cần thiết để xác định và nghiên cứu doanh nghiệp; không gửi toàn bộ contact, note, lịch sử gặp hoặc ảnh card khi không cần.

Structured output tối thiểu:

```json
{
  "company_name": "",
  "official_website": "",
  "summary": "",
  "industry": [],
  "products_services": [],
  "target_customers": [],
  "markets": [],
  "headquarters": null,
  "company_size": null,
  "public_contacts": [],
  "confidence": 0,
  "researched_at": "",
  "sources": []
}
```

Rules:

- Ưu tiên official website và nguồn chính thức/uy tín.
- Không bịa hoặc suy đoán fact không có bằng chứng.
- Không xác minh được thì trả `null` hoặc mảng rỗng.
- Mỗi fact quan trọng truy được source.
- Lưu URL, title, accessed/retrieved time và fact mapping phù hợp.
- Validate structured output ở server trước khi lưu.
- Không biến phone/email cá nhân trên card thành company fact.
- Hotline/public contact phải là kênh công ty công bố công khai.
- Rate limit, timeout, size limit và error classification rõ ràng.
- Không log prompt/response chứa PII không cần thiết.

## 13. Research cache

- Cache theo resolved company/domain đã normalize.
- Có `researched_at`, expiry, manual refresh và TTL cấu hình tập trung.
- TTL mặc định có thể là 30 ngày.
- Auto Research phải đọc cache trước.
- Manual refresh tạo research version mới hoặc cập nhật có audit phù hợp.
- Request đồng thời cùng key không tạo nhiều job/cost không cần thiết.
- Cache hit, miss, expired, failed và unresolved có test.
- Cache không được dùng để trộn tenant-private data.

## 14. Research UI

Thêm section phù hợp design system hiện tại trong Contact/Company Detail.

Các trạng thái:

```text
not_researched
resolving
researching
completed
unresolved
failed
```

Khi `completed`, hiển thị:

- Company Name.
- Official Website.
- Summary.
- Industry.
- Products/Services.
- Target Customers.
- Markets.
- Headquarters.
- Company Size nếu có nguồn.
- Public Company Contact/Hotline.
- Sources.
- Last researched time.
- Refresh action.

UI phải tách rõ:

```text
Liên hệ cá nhân
```

và:

```text
Thông tin công khai của doanh nghiệp
```

Không thay đổi toàn bộ thiết kế hoặc thêm framework chỉ để xây section này.

## 15. Data export, delete và quyền dữ liệu

- Export chỉ xuất dữ liệu của authenticated user.
- Export bao gồm contact, methods, relationships, cards, image metadata/path, encounters, notes, tags, proposals, provenance và research thuộc phạm vi account.
- Không nhúng signed URL còn hạn dài hoặc server secret trong export.
- Delete/restrict source card phải đánh giá derived value/relationship theo lineage.
- Queue, local cache/index, Storage object, thumbnail và server row đều nằm trong delete/restrict scope.
- Không dùng hard delete bừa làm mất audit tối thiểu hoặc khiến queue hồi sinh dữ liệu.
- Có capability tiếp nhận và theo dõi data request ở mức phù hợp pilot.
- Retention cụ thể phải nằm trong config/policy và được legal/security review trước pilot thật.

## 16. Security

Bắt buộc:

- RLS cho mọi private table.
- Owner-based authorization.
- Private Storage và Storage policies.
- Server-side auth validation.
- Không tin `owner_id`/`user_id` client gửi lên.
- Edge Function derive user từ authenticated JWT/session.
- Validate input, content type, size, enum và identifier.
- Validate research structured output trước khi lưu.
- Không expose secrets trong bundle/source/log/error.
- User A không đọc, sửa, xóa, export hoặc download dữ liệu user B.
- Cross-owner foreign key/link bị chặn.
- Rate limit và abuse protection cho research.
- CSP/service worker không cache auth response, signed URL hoặc private API payload sai phạm vi.
- Log che PII mặc định; admin/support access có role, reason và audit.
- Dependency update, proposal accept và provenance update nhất quán.
- Không dùng service-role key ở browser/mobile.

Thêm automated test hoặc SQL verification cho RLS và tenant isolation. Không chỉ kiểm tra bằng việc ẩn UI.

## 17. Environment và secrets

Tạo/cập nhật `.env.example` theo cách build thực tế. Có thể dùng tên public prefix phù hợp, nhưng phải tách rõ public client config và Edge Function secrets.

Ví dụ:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Server-side / Supabase Edge Function secrets only
OPENAI_API_KEY=
COMPANY_RESEARCH_MODEL=
COMPANY_RESEARCH_CACHE_DAYS=30
```

Yêu cầu:

- Không commit `.env` thật.
- Fail fast với thông báo rõ khi thiếu public config cần thiết.
- App demo/local có chế độ development rõ ràng; không fake production success.
- OpenAI key chỉ nằm trong Supabase secrets/server environment.
- Document cách set environment cho local web, Supabase local/remote và build Capacitor.

## 18. PWA và Capacitor

Đảm bảo:

- Web app chạy sau production build.
- PWA manifest hợp lệ.
- Offline shell hoạt động.
- Service worker chỉ cache static public assets/OCR models cần thiết.
- Không cache private API response, auth response hoặc signed image URL bằng cache chung.
- Upgrade service worker không làm mất local pending queue.
- Capacitor sync hoàn tất.
- Android project build/sync không bị phá.
- iOS project sync không bị phá.
- Camera/file picker và private image access được thử trên target khả dụng.
- Permission description/config được bổ sung đúng khi native build cần.

Không bắt buộc signing hoặc phát hành App Store/Google Play nếu môi trường không có credential. Không tuyên bố store-ready nếu chưa qua review checklist và build thiết bị thật.

## 19. Tests và quality gate

Giữ toàn bộ test hiện tại và bổ sung test cho:

- Repository/data layer.
- Auth/session state.
- Local database migration.
- Offline create/edit.
- Pending queue và dependency ordering.
- Retry/backoff/idempotency.
- Optimistic concurrency và stale write.
- Image upload/download/delete.
- Account switch và late callback isolation.
- RLS/tenant isolation.
- Company resolver.
- Research input minimization.
- Structured output validation.
- Research cache và manual refresh.
- Lifecycle/provenance/proposal regression.
- Service worker cache boundary.

Chạy mọi kiểm tra khả dụng theo scripts thật của repository, tối thiểu:

```powershell
npm test
npm run check
npm run build
npm run test:ocr
npm run test:visual
npm run mobile:sync
```

Nếu test cần Supabase:

- Cung cấp lệnh setup local project/migrations.
- Dùng test users riêng và dọn fixture an toàn.
- Có test chứng minh user A không truy cập được dữ liệu user B.
- Không làm test phụ thuộc service-role key trong client.

Mọi lỗi do thay đổi mới phải được sửa. Ghi lại command, kết quả và phần không thể chạy vì giới hạn môi trường.

## 20. Documentation và deliverables

Cập nhật hoặc tạo:

- README setup local và production build.
- `.env.example` không chứa secret.
- Supabase migrations và hướng dẫn apply/rollback an toàn.
- Danh sách Edge Functions, input/output và required secrets.
- Data model/ownership boundary ngắn gọn.
- Offline/sync behavior và conflict UX.
- Storage path/policy và image lifecycle.
- Security/RLS verification guide.
- Deployment checklist web/PWA/Capacitor.
- Known limitations thật sự còn lại.

Không để tài liệu nói backend/sync/security đã hoạt động nếu implementation chưa có.

## 21. Definition of Done

Chỉ coi code implementation hoàn thành khi luồng sau hoạt động end-to-end trên môi trường test có credential hợp lệ:

```text
Sign up / Sign in
→ Protected app opens
→ Scan card front/back
→ OCR Vietnamese/English locally
→ Review/Edit
→ Save locally as LOCAL_ACCEPTED
→ Contact and Card created
→ Private images uploaded
→ Objects persisted in Supabase
→ Per-object/version ACK recorded
→ Close/reopen app: data remains
→ Search works
→ Offline: existing data remains accessible
→ Offline edit is durably queued
→ Online again: dependencies sync successfully
→ Retry creates no duplicate row or image
→ Stale update does not overwrite a newer version
→ Second device/login sees server-synced data
→ Account isolation remains correct
→ Contact Detail opens
→ Eligible saved company automatically enqueues Company Research without a manual click
→ Resolver identifies company or safely returns unresolved
→ Server-side research runs without exposing secret
→ Structured facts and sources are validated and saved
→ UI separates personal and public company data
→ Research cache works
→ Manual refresh works
→ Delete/restrict does not allow stale queue to restore data
→ Export returns only the current user's scoped data
→ Logout/login preserves correct account isolation
→ Production build passes
→ Available automated tests pass
```

Ngoài automated tests, trước pilot namecard thật còn phải hoàn tất:

- Core P0 Legal & Store Gate.
- Privacy/retention/data map review.
- Threat model và security review.
- Backup/restore test.
- Android/iOS device validation.
- Incident/support ownership.

Nếu các gate này chưa đạt, kết luận phải là **implementation complete nhưng pilot/production release còn blocked**, không được đổi thành “production-ready” chỉ vì test code pass.

## 22. Out of Scope

Không triển khai trong lần này:

- Full CRM.
- Social network hoặc people graph.
- Shared cross-tenant contact graph.
- Complex canonical company graph dùng chung toàn thị trường.
- Shareholder/stock/financial intelligence.
- Continuous news monitoring.
- Competitor intelligence engine.
- Automatic lead scoring.
- Autonomous sales agent.
- Zalo/WhatsApp account automation.
- Billing/subscription.
- Advanced multi-agent research.
- Full merge/undo identity engine.
- CRDT hoặc collaborative realtime sync.
- React/Next.js/framework rewrite chỉ để đổi công nghệ.
- Custom backend nếu Supabase đáp ứng được yêu cầu.
- Tự động dùng dữ liệu private của tenant làm public company facts.

Không mở rộng scope trừ khi bắt buộc để Definition of Done hoạt động hoặc để vá lỗi bảo mật/mất dữ liệu nghiêm trọng.

## 23. Final response format

Sau khi đã triển khai và kiểm tra tối đa, báo cáo ngắn theo đúng bằng chứng:

```text
STATUS
- COMPLETED | PARTIALLY COMPLETED | BLOCKED

COMPLETED
- ...

MAIN FILES CHANGED
- ...

DATABASE / MIGRATIONS
- ...

EDGE FUNCTIONS
- ...

ENV REQUIRED
- ...

RUN
- ...

TEST
- command: PASS/FAIL/NOT RUN — lý do

SECURITY / RLS EVIDENCE
- ...

EXTERNAL GATES
- ...

BLOCKERS
- None | ...
```

Không ghi `COMPLETED` nếu Definition of Done chưa được chứng minh. Thiếu credential hoặc external service không ngăn việc hoàn thiện tối đa code, migrations, tests và tài liệu, nhưng phải được ghi đúng là blocker của kiểm thử end-to-end/deployment.
