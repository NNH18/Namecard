# BCard v1.1.0 — Danh sách lỗi và cách sửa

> **Phạm vi:** audit 360 từ giao diện đến trải nghiệm người dùng, trên mã nguồn tại `v1.1.0`.
> **Cách kiểm chứng:** mọi số đo trong file này lấy từ **Chrome thật** (Playwright + Chrome cài trên máy), viewport 390×844 và các bề rộng 320/360/375/390/430/1024, chạy cả light theme và dark theme. Không có con số nào suy ra từ việc đọc code.
> **Tổng:** 15 hạng mục — 4 P1, 6 P2, 2 P3, 3 hạ tầng. Thêm 1 hạng mục chờ quyết định (mục 7) và 6 điều **không phải lỗi** đã loại bỏ (mục 6).

Mỗi lỗi trình bày theo cùng một cấu trúc: **Vị trí → Triệu chứng → Nguyên nhân → Sửa → Kiểm chứng lại**.

---

## 0. Lệnh kiểm chứng dùng chung

```bash
npm run check && npm test
```

```bash
npm run build
```

Với các test cần trình duyệt, phải mở server ở **terminal thứ hai trước** (xem lỗi H-14):

```bash
npm start
```

```bash
npm run test:visual && npm run test:ocr
```

---

# 1. Mức P1 — chặn trải nghiệm, sửa trước khi demo

## P1-1. Bấm chip lọc làm mất nội dung tìm kiếm và trả về danh sách trắng

**Vị trí:** [app.js:405](app.js#L405) (handler `[data-filter]`), [app.js:432](app.js#L432) (`renderContactsInPlace`), [app.js:300](app.js#L300) (`renderContacts`)

**Triệu chứng (tái hiện trong Chrome thật):**

| Bước | Kết quả thực tế |
|---|---|
| Vào Danh bạ, gõ `khoa` | Hiện đúng 1 người: Lê Quốc Khoa |
| Bấm chip `Công nghệ` | Ô tìm kiếm **bị xoá trắng**, bộ lọc Sự kiện **reset về "Tất cả sự kiện"**, danh sách **rỗng hoàn toàn, không một chữ nào** |
| Thực tế đúng phải là | Hiện Trần Minh Anh (đang có tag `Công nghệ`) |
| Gõ thêm 1 ký tự bất kỳ | Lúc này mới hiện đúng Trần Minh Anh |

**Nguyên nhân:** `renderContactsInPlace()` dựng lại **toàn bộ** view bằng `renderContacts()`. Trong lúc dựng, `filteredContacts()` đọc `document.getElementById("contactSearch").value` — lúc đó vẫn là **input cũ** còn chữ `khoa`. Sau đó DOM bị thay bằng input mới rỗng. Kết quả: danh sách được tính theo query cũ, còn ô nhập lại hiển thị rỗng — hai thứ lệch nhau, người dùng không có cách nào hiểu vì sao "không có ai".

**Sửa:** không dựng lại cả view khi bấm chip. Chỉ đổi trạng thái active của chip rồi cập nhật đúng vùng kết quả bằng `updateContactResults()` (hàm này vốn đã giữ nguyên input và đã có empty state).

Thay [app.js:405](app.js#L405):

```js
$view.on("click.memento", "[data-filter]", function () { contactFilter = this.dataset.filter; renderContactsInPlace(); });
```

thành:

```js
$view.on("click.memento", "[data-filter]", function () {
  contactFilter = this.dataset.filter;
  $view.find("[data-filter]").each(function () {
    this.classList.toggle("active", this.dataset.filter === contactFilter);
  });
  updateContactResults();
});
```

Sau thay đổi này, `renderContactsInPlace()` không còn được dùng ở đâu — có thể xoá hàm đó ([app.js:432](app.js#L432)) cho gọn.

**Kiểm chứng:** gõ `khoa` → bấm chip `Công nghệ` → ô tìm kiếm phải **vẫn còn chữ `khoa`**, bộ lọc Sự kiện **vẫn giữ lựa chọn cũ**, và danh sách phải khớp với đúng hai điều kiện đang hiển thị.

---

## P1-2. Mất hẳn thông báo "không có kết quả" khi render toàn phần

**Vị trí:** [app.js:300](app.js#L300) so với [app.js:309](app.js#L309)

**Triệu chứng:** khi 0 kết quả, hai đường đi cho ra hai giao diện khác nhau:

- Gõ vào ô tìm kiếm → hiện đúng `Không có kết quả trong dữ liệu trên thiết bị.`
- Render toàn phần (bấm chip, hoặc vào Danh bạ khi bộ lọc còn lưu từ trước) → **panel trắng trơn**, đo được `innerHTML.length = 0`.

**Nguyên nhân:** `renderContacts()` dùng `filteredContacts().map(contactRow).join("")` — không có nhánh dự phòng khi mảng rỗng. Chỉ `updateContactResults()` mới có empty state. Hai chỗ cùng dựng một danh sách nhưng không dùng chung code.

**Sửa:** tách phần dựng danh sách ra một hàm dùng chung. Thêm hàm mới (đặt ngay trước `renderContacts`):

```js
function contactResultsMarkup(results = filteredContacts()) {
  return results.length
    ? results.map(contactRow).join("")
    : `<div class="empty">${icon("search-x")}Không có kết quả trong dữ liệu trên thiết bị.</div>`;
}
```

Trong [app.js:300](app.js#L300), thay `${filteredContacts().map(contactRow).join("")}` thành `${contactResultsMarkup()}`.

Trong [app.js:309](app.js#L309), thay dòng gán `target.innerHTML = results.length ? ... : ...` thành:

```js
  target.innerHTML = contactResultsMarkup(results);
```

**Kiểm chứng:** đặt bộ lọc cho ra 0 kết quả rồi chuyển route đi và quay lại Danh bạ — phải luôn thấy dòng "Không có kết quả…", không bao giờ thấy panel trắng.

---

## P1-3. Tương phản màu dưới chuẩn WCAG AA ngay tại nút hành động chính

**Vị trí:** [styles.css](styles.css) — các dòng ghi trong bảng dưới

**Triệu chứng:** đo trên Chrome thật, tính theo **color stop xấu nhất của gradient** (đúng nguyên tắc WCAG cho nền gradient: chữ phải đọc được trên toàn bộ dải màu). Nhãn `Quét` của nút FAB fail ở **mọi màn hình, cả hai theme**.

| Vị trí | Phần tử | Màu hiện tại | Tỉ lệ | Cần | Màu đề xuất | Tỉ lệ sau sửa |
|---|---|---|---|---|---|---|
| [styles.css:118](styles.css#L118) | `.bottom-nav > .scan-fab` (nhãn "Quét", 10px) | `#fd783c → #cf3c03` | **2.65** | 4.5 | `#d2440a → #a82f02` | **4.59** |
| [styles.css:149](styles.css#L149) | `.hero .button` ("Quét namecard", 16px) | `#ff8b50 → #d94804` | **2.32** | 4.5 | `#d2440a → #a63204` | **4.59** |
| [styles.css:138](styles.css#L138) | `.button.danger` ("Xóa & đặt lại", 13px) | `#e94b4b → #b92424` | **3.77** | 4.5 | `#d13a3a → #a51f1f` | **4.80** |
| [styles.css:131](styles.css#L131) | `.button` primary (16px) | `#3472fa → #174dbc` | **4.26** | 4.5 | `#2f6ae8 → #174dbc` | **4.83** |
| [styles.css:126](styles.css#L126) | `.eyebrow` 12px (light theme) | `--color-accent: #d94f08` | **3.83** | 4.5 | token riêng `#b8430a` | **5.05** |
| [styles.css:146](styles.css#L146) | `.hero .eyebrow` ("Xin chào, Hà", 12px) | `#ffbf9d` | **3.08** | 4.5 | `#fff8f4` | **4.67** |

**Sửa:** đổi giá trị gradient/màu chữ theo cột "Màu đề xuất". Riêng `.eyebrow` **không đổi trực tiếp `--color-accent`** (token này còn dùng cho dot thông báo, viền, nền — không phải chữ, nên không cần hạ độ sáng). Thêm một token riêng cho chữ:

Trong `:root` ([styles.css](styles.css#L7), cạnh `--color-accent`):

```css
  --color-accent-text: #b8430a;
```

Trong `body.theme-dark` ([styles.css:55](styles.css#L55) khu vực token dark, cạnh `--color-accent: #ff8a4d`):

```css
  --color-accent-text: #ff8a4d;
```

Dark theme giữ nguyên giá trị cũ vì `.eyebrow` trên nền tối **đã đạt** — chỉ light theme fail.

Rồi sửa [styles.css:126](styles.css#L126): `color: var(--color-accent)` → `color: var(--color-accent-text)`.

**Lưu ý khi sửa:** đừng dùng `text-shadow` để "chữa" tương phản — WCAG không tính text-shadow. Nhãn 10px của FAB không thể dùng ngoại lệ "chữ lớn" (ngoại lệ cần ≥18.66px in đậm), nên bắt buộc phải làm nền đậm hơn.

**Kiểm chứng:** chạy script ở mục 8 của file này. Kết quả mong đợi: 0 dòng FAIL trên cả 7 route × 2 theme.

---

## P1-4. Không có xử lý history/back — nút Back của Android sẽ thoát app

**Vị trí:** [app.js:224](app.js#L224) (`setRoute`), [app.js:1290](app.js#L1290) (khối khởi tạo)

**Triệu chứng:** toàn bộ source **không có** `pushState`, `hashchange`, `popstate` hay listener `backButton` của Capacitor (đã grep xác nhận 0 kết quả). Hậu quả:

- Trên bản Android đóng gói bằng Capacitor: bấm **nút Back cứng khi đang xem hồ sơ một người sẽ thoát app**, thay vì lùi về danh bạ.
- Không deep link được tới một contact; không chia sẻ/bookmark được.
- Nhấn F5 / mở lại app luôn quay về Tổng quan, mất vị trí đang xem.

**Sửa:** thêm hash routing hai chiều. Trong `setRoute` ([app.js:224](app.js#L224)), thêm vào **cuối hàm**:

```js
  const path = selectedContactId ? `#/contacts/${selectedContactId}` : `#/${next}`;
  if (options.fromHistory) history.replaceState({ route: next, contactId: selectedContactId }, "", path);
  else if (location.hash !== path) history.pushState({ route: next, contactId: selectedContactId }, "", path);
```

Thêm hàm đọc route từ URL (đặt ngay sau `setRoute`):

```js
function applyRouteFromLocation() {
  const parts = String(location.hash || "").replace(/^#\/?/, "").split("/");
  const next = parts[0] || "home";
  const contactId = next === "contacts" ? (parts[1] || "") : "";
  setRoute(next, { contactId, fromHistory: true });
}
```

Trong khối `$(function () { ... })`, thay dòng `render();` ([app.js:1290](app.js#L1290)) thành:

```js
  if (location.hash) applyRouteFromLocation(); else render();
  $(window).on("popstate.shell", applyRouteFromLocation);
```

Và thêm xử lý nút Back cứng cho bản native (đặt cạnh dòng đăng ký service worker ở cuối khối khởi tạo):

```js
  const nativeApp = window.Capacitor?.Plugins?.App;
  nativeApp?.addListener?.("backButton", () => {
    if (!modalBackdrop.hidden) return closeModal();
    if (selectedContactId || route !== "home") return history.back();
    nativeApp.exitApp?.();
  });
```

**Kiểm chứng:** mở một contact → URL phải thành `#/contacts/ct_xxx`; bấm Back của trình duyệt phải về danh bạ chứ không rời trang; F5 tại URL đó phải mở lại đúng hồ sơ đó. Trên Android: Back khi đang mở modal phải đóng modal, Back ở Tổng quan mới thoát app.

---

# 2. Mức P2 — sửa trước khi chạy pilot

## P2-5. Card 3D che mất phần trên của hai số liệu ở trang chủ

**Vị trí:** [styles.css:152](styles.css#L152) (`.floating-card`, `top: 33%`), [styles.css:160](styles.css#L160) (`.hero-stat`), markup ở [app.js:266](app.js#L266)

**Triệu chứng (đo trên Chrome thật):** `.floating-card.front` chồng lên `.hero-stat` **25px** và phủ lên **phần trên của hai chữ số** ở hàng đầu ("Trong danh bạ", "Card đã lưu"). Số bên phải gần như không đọc được, trong khi hai số "3" hàng dưới thì nguyên vẹn.

| Bề rộng | Overlap | Số bị che? |
|---|---|---|
| 320px | 10px | Không |
| 360px | 22px | Không |
| **375px** | **25px** | **Có** |
| **390px** | **25px** | **Có** |
| **430px** | **25px** | **Có** |

Tức là lỗi xuất hiện đúng ở dải máy phổ biến nhất (iPhone 12–15 và hầu hết Android), bao gồm chính breakpoint 390 mà bộ visual smoke test đang chụp ảnh nhưng không assert.

**Sửa:** nâng chồng card lên trong media query điện thoại. Thêm vào khối `@media (max-width: 479px)` ở [styles.css:406](styles.css#L406):

```css
  .floating-card { top: 26%; }
```

**Đã test giá trị này** trên 320/360/375/390/430px: overlap ≤ 0 ở mọi bề rộng, không đè lên khối chữ `.hero-copy`, vẫn giữ được hiệu ứng card xếp lớp. (Giá trị `28%` cũng hết che số nhưng còn dư 7px overlap.)

**Kiểm chứng:** mở trang chủ ở 375/390/430px, hai số hàng đầu phải hiện đủ cả chữ số.

---

## P2-6. Chip lọc hardcode theo tag của dữ liệu demo

**Vị trí:** [app.js:296](app.js#L296)

**Triệu chứng:** danh sách chip cố định `["Tất cả", "Công nghệ", "Đầu tư", "Thiết kế", "Chưa xác nhận"]`, trong khi:

- Dữ liệu thực tế đang có thêm các tag `Đối tác tiềm năng`, `Fintech`, `Môi trường`, `Y tế` — **không có chip nào để lọc**.
- Contact do người dùng tự quét chỉ được gán `[]` hoặc `["Chưa xác nhận"]` ([app.js:963](app.js#L963)), và **không có UI nào để gắn tag**. Nên với dữ liệu thật, **3/5 chip sẽ chết vĩnh viễn** (bấm vào luôn ra rỗng).

**Sửa (phần lọc):** sinh chip từ dữ liệu thật. Thay [app.js:296](app.js#L296):

```js
  const filters = ["Tất cả", "Công nghệ", "Đầu tư", "Thiết kế", "Chưa xác nhận"];
```

thành:

```js
  const filters = ["Tất cả", ...new Set(
    data.contacts.filter(contact => contact.lifecycle !== "DELETED").flatMap(contact => contact.tags || [])
  )];
```

Tag `Chưa xác nhận` vẫn tự xuất hiện vì nó được gán sẵn cho hồ sơ nháp. Nếu `contactFilter` đang trỏ tới một tag không còn tồn tại, cần reset — thêm ngay sau dòng trên:

```js
  if (!filters.includes(contactFilter)) contactFilter = "Tất cả";
```

**Còn thiếu (việc riêng, không thuộc lỗi này):** chưa có UI để người dùng thêm/xoá tag cho một contact. Nếu không làm phần đó thì bộ lọc tag chỉ có ý nghĩa với dữ liệu mẫu.

**Kiểm chứng:** quét một card mới, không có tag → chip chỉ còn những tag thật đang tồn tại; bấm bất kỳ chip nào cũng phải ra ít nhất 1 người.

---

## P2-7. Danh tính người dùng bị hardcode ở 4 nơi

**Vị trí:** [app.js:264](app.js#L264) ("Xin chào, Hà"), [app.js:380](app.js#L380) và [app.js:381](app.js#L381) ("Nguyễn Hà" + email), [app.js:1203](app.js#L1203) (email mặc định trong form yêu cầu dữ liệu), [index.html:45](index.html#L45) (thẻ tài khoản ở sidebar)

**Triệu chứng:** tên và email là chuỗi cố định trong code, không đọc từ dữ liệu. Người dùng thật sẽ thấy **tên người khác** trên màn hình Tài khoản, ở lời chào trang chủ, và trong form **yêu cầu quyền dữ liệu (DSR)** — chỗ sai tên ở form DSR là vấn đề về quyền riêng tư, không chỉ là lỗi hiển thị.

**Sửa:** thêm profile vào `seed.settings` ([app.js:8](app.js#L8)):

```js
  settings: { online: true, accountId: "acc_demo_01", lastSync: "08:42 hôm nay", activeEventId: "evt_01",
    profile: { name: "Nguyễn Hà", email: "ha.nguyen@example.com", initials: "NH" } },
```

`normalizeStoredData` đã merge `settings` với fallback ([app.js:89](app.js#L89)) nên dữ liệu cũ tự có `profile`. Sau đó thay 4 chỗ hardcode bằng `data.settings.profile.name` / `.email` / `.initials` (nhớ bọc `esc(...)`), ví dụ lời chào:

```js
<p class="eyebrow">Xin chào, ${esc(data.settings.profile.name.split(" ").at(-1))}</p>
```

Với sidebar trong HTML, gán id để hydrate được — sửa [index.html:45](index.html#L45):

```html
        <span><strong id="sidebarProfileName">—</strong><small id="sidebarProfileEmail">—</small></span>
```

rồi thêm vào `updateChrome()` ([app.js:215](app.js#L215)):

```js
  document.getElementById("sidebarProfileName").textContent = data.settings.profile.name;
  document.getElementById("sidebarProfileEmail").textContent = data.settings.profile.email;
```

**Kiểm chứng:** đổi `profile.name` trong localStorage rồi reload — cả 4 chỗ phải đổi theo, không còn chuỗi "Nguyễn Hà" nào trong `app.js`/`index.html` (grep để chắc).

---

## P2-8. Badge thông báo đỏ luôn sáng, không bao giờ tắt

**Vị trí:** [index.html:56](index.html#L56)

**Triệu chứng:** `.notification-dot` được viết cứng trong HTML và **không có dòng code nào tắt nó** (khác `#syncDot` vốn được toggle ở [app.js:218](app.js#L218)). Người dùng luôn thấy dấu đỏ "có thông báo" dù không có gì — làm mất ý nghĩa của chỉ báo.

**Sửa:** gán id cho dot — sửa [index.html:56](index.html#L56):

```html
<span class="notification-dot" id="notificationDot" aria-hidden="true"></span>
```

Rồi toggle theo đúng dữ liệu mà chính nút này báo khi bấm. Thêm vào cuối `updateChrome()` ([app.js:215](app.js#L215)):

```js
  const drafts = data.contacts.filter(contact => contact.lifecycle === "ACTIVE" && contact.draft).length;
  document.getElementById("notificationDot").hidden = !(pending || drafts);
```

(`pending` đã có sẵn trong `updateChrome` ở [app.js:217](app.js#L217).)

**Kiểm chứng:** khi mọi object đã `COMPLETE` và không còn hồ sơ nháp → dot phải ẩn; tạo một hồ sơ chưa xác nhận → dot phải hiện lại.

---

## P2-9. Chip lọc chỉ cao 42px trên điện thoại, thấp hơn mức 44px mà tài liệu tự cam kết

**Vị trí:** [styles.css:408](styles.css#L408)

**Triệu chứng:** `.chip` mặc định `min-height: 44px` ([styles.css:195](styles.css#L195)) là đúng, nhưng media query điện thoại **hạ xuống 42px** — đúng ở nơi cần 44px nhất. Đo trên Chrome thật: cả 5 chip đều cao 42px ở 390px.

**Sửa:** trong [styles.css:408](styles.css#L408):

```css
  .chip { min-height: 44px; padding-right: 12px; padding-left: 12px; }
```

**Kiểm chứng:** đo lại chiều cao chip ở 390px, phải ≥ 44px. (Các nút khác đã đạt 44–48px, không cần sửa — xem mục 6.)

---

## P2-10. ID sinh bằng `Date.now()` trần, có thể trùng

**Vị trí:** [app.js:989](app.js#L989), [app.js:1067](app.js#L1067), [app.js:1150](app.js#L1150), [app.js:1154](app.js#L1154), [app.js:1225](app.js#L1225)

**Triệu chứng:** id của note / encounter / method / relationship / event chỉ dựa vào mốc thời gian milli-giây. Hai thao tác trong cùng một milli-giây (thao tác lập trình, test tự động, bấm nhanh liên tiếp) sẽ tạo **id trùng nhau** — sau đó mọi chỗ `find(x => x.id === ...)` sẽ lấy sai bản ghi. Chỗ tạo proposal đã làm đúng (có counter: `prop_${stamp}_${++proposalCount}` ở [app.js:951](app.js#L951)), các chỗ còn lại thì không.

**Sửa:** thêm một helper dùng chung (đặt cạnh `clone` ở [app.js:83](app.js#L83)):

```js
let idSequence = 0;
function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${(++idSequence).toString(36)}`;
}
```

Rồi thay: `n_${Date.now()}` → `makeId("n")`, `enc_relink_${Date.now()}` → `makeId("enc_relink")`, `m_${Date.now()}` → `makeId("m")`, `rel_${Date.now()}` → `makeId("rel")`, `evt_${Date.now()}` → `makeId("evt")`.

**Lưu ý:** không đổi id của dữ liệu đã lưu, chỉ đổi cách sinh id mới — nên thay đổi này an toàn với localStorage cũ.

**Kiểm chứng:** thêm 2 ghi chú liên tiếp bằng script trong cùng một tick, kiểm tra 2 id khác nhau. `npm test` phải vẫn 23/23 pass.

---

# 3. Mức P3 — hoàn thiện

## P3-11. Ba chỗ tương phản còn thiếu chút ít

| Vị trí | Phần tử | Hiện tại | Tỉ lệ | Đề xuất | Tỉ lệ sau |
|---|---|---|---|---|---|
| [styles.css:117](styles.css#L117) | `.bottom-nav > button.active` (nhãn 10px) | `--color-primary #2563eb` trên `--color-primary-soft #dce8ff` | 4.19 | dùng `var(--color-primary-strong)` (`#1746b8`) | **6.54** |
| [styles.css:212](styles.css#L212) | `.avatar.yellow` (chữ viết tắt 14px) | `#765a00` trên `#fff1bd → #edcd62` | 4.18 | `#5c4600` | **5.80** |

## P3-12. Chạy test ghi đè lên file evidence đã commit

**Triệu chứng:** `npm run test:visual` và `npm run test:ocr` ghi ảnh và JSON bằng chứng **vào thư mục gốc repo, đè lên file đã commit** (`audit-v1.1.0-*.png`, `BCard_ComputedStyle_Evidence_v1.1.0.json`, `BCard_OCR_Runtime_Evidence_v1.1.0.json`). Chỉ cần chạy test là working tree bị bẩn 6–7 file, lẫn vào diff của thay đổi thật.

**Sửa:** cho test ghi ra thư mục riêng, ví dụ `audit-evidence-v1.1.0/` hoặc một thư mục `test-output/` được thêm vào `.gitignore`; chỉ copy sang file evidence chính thức khi chủ động phát hành.

---

# 4. Hạ tầng và bộ test

## H-13. Bốn file test hardcode đường dẫn Chrome của Windows

**Vị trí:** [test/visual-smoke.js:6](test/visual-smoke.js#L6), [test/ocr-smoke.js:35](test/ocr-smoke.js#L35), [test/ocr-live-card.js:22](test/ocr-live-card.js#L22), [test/ocr-form-live-card.js:14](test/ocr-form-live-card.js#L14)

**Triệu chứng:** cả 4 file đều ghi cứng `C:\Program Files\Google\Chrome\Application\chrome.exe`. Trên máy khác (Chrome cài chỗ khác) hoặc CI macOS/Linux, các test này **không launch được browser**. Hiện chỉ chạy được trên đúng máy dev này.

**Sửa:** cho phép override bằng biến môi trường, kèm dò một số đường dẫn phổ biến:

```js
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
```

Rồi khi chạy trên máy/CI khác chỉ cần đặt `CHROME_PATH`. Nếu muốn hết phụ thuộc hẳn, đổi `playwright-core` sang `playwright` (có browser đi kèm) — nhưng sẽ tăng dung lượng cài.

## H-14. `test:visual` và `test:ocr` cần server chạy sẵn nhưng không tự khởi động

**Vị trí:** [package.json:14](package.json#L14) (script `test:visual`, `test:ocr`), [README.md:23](README.md#L23)

**Triệu chứng:** README liệt kê các lệnh theo thứ tự `npm test` → `npm run check` → `npm run build` → `npm run test:ocr` → `npm run test:visual`, làm người đọc tưởng chạy tuần tự là được. Thực tế chạy đúng thứ tự đó sẽ **fail ngay** với `ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/` vì chưa có server. (Đã tái hiện.)

**Sửa:** chọn một trong hai:

- Cho script tự bật server: `"test:visual": "node test/with-server.js node test/visual-smoke.js"` (viết một wrapper nhỏ spawn `server.js`, đợi port sẵn, chạy test, rồi kill).
- Hoặc tối thiểu: ghi rõ trong README rằng phải mở `npm start` ở terminal khác trước, và cho test báo lỗi dễ hiểu khi không kết nối được.

## H-15. Repo phình 72MB vì commit file zip và bản sao

**Triệu chứng:** `.git` đã 72MB chỉ sau 1 commit. Đang commit vào git:

| Mục | Dung lượng |
|---|---|
| `BCard-web-demo-1.1.0.zip` | 22.7MB |
| `BCard-web-source-1.1.0.zip` | 24.1MB |
| `BCard-web-source-1.1.0/` (bản sao chép tay của toàn bộ source gốc) | ~51MB |
| `BCard-web-demo-1.1.0/` | ~50MB |
| `www/` (kết quả build, tái tạo được bằng `npm run build`) | ~50MB |

Tức là cùng một nội dung tồn tại 4 bản. Rủi ro thật: ai sửa `app.js` ở gốc mà quên đồng bộ `BCard-web-source-1.1.0/app.js` thì hai bản lệch nhau âm thầm (hiện tại đã kiểm tra: **chưa lệch**).

**Sửa:** thêm vào `.gitignore`: `www/`, `*.zip`, `BCard-web-demo-*/`, `BCard-web-source-*/`; đưa file zip sang GitHub Release/artifact thay vì commit. Nếu muốn thu nhỏ cả lịch sử thì phải rewrite history (`git filter-repo`) — cân nhắc vì đổi hash commit.

---

# 5. Bảng tổng hợp và thứ tự xử lý đề xuất

| # | Lỗi | Mức | File chính | Công sức |
|---|---|---|---|---|
| P1-1 | Chip lọc xoá query, danh sách trắng | P1 | app.js | Nhỏ |
| P1-2 | Mất empty state khi render toàn phần | P1 | app.js | Nhỏ |
| P1-3 | Tương phản dưới AA ở CTA chính | P1 | styles.css | Nhỏ |
| P1-4 | Không có history/back | P1 | app.js | Trung bình |
| P2-5 | Card 3D che số KPI | P2 | styles.css | Rất nhỏ |
| P2-6 | Chip lọc hardcode | P2 | app.js | Nhỏ |
| P2-7 | Danh tính hardcode 4 chỗ | P2 | app.js, index.html | Nhỏ |
| P2-8 | Badge thông báo luôn sáng | P2 | app.js, index.html | Rất nhỏ |
| P2-9 | Chip 42px < 44px | P2 | styles.css | Rất nhỏ |
| P2-10 | ID trùng do `Date.now()` | P2 | app.js | Nhỏ |
| P3-11 | Tương phản nav active, avatar vàng | P3 | styles.css | Rất nhỏ |
| P3-12 | Test ghi đè file evidence | P3 | test/ | Nhỏ |
| H-13 | Hardcode đường dẫn Chrome | Hạ tầng | test/ | Rất nhỏ |
| H-14 | Test cần server nhưng không tự bật | Hạ tầng | package.json, README | Nhỏ |
| H-15 | Repo phình 72MB | Hạ tầng | .gitignore | Nhỏ |

**Thứ tự đề nghị:**

1. **Đợt 1 (một lần sửa, cùng vùng code, rủi ro thấp):** P1-1 + P1-2 + P2-6 + P2-8 — tất cả nằm trong luồng Danh bạ và `updateChrome`.
2. **Đợt 2 (chỉ CSS, không rủi ro logic):** P1-3 + P2-5 + P2-9 + P3-11.
3. **Đợt 3:** P1-4 (history/back) — bắt buộc nếu còn đóng gói Android.
4. **Đợt 4:** P2-7, P2-10, rồi nhóm hạ tầng H-13 → H-15.

Sau mỗi đợt: `npm run check && npm test`, rồi `npm start` + `npm run test:visual` ở terminal khác.

---

# 6. KHÔNG phải lỗi — đã kiểm và loại bỏ, đừng sửa

Trong quá trình audit có 6 thứ **trông như lỗi nhưng không phải**. Ghi lại để không mất thời gian sửa thứ không hỏng:

| Nghi vấn ban đầu | Kết luận sau khi kiểm chứng |
|---|---|
| Service worker fail: `An unknown error occurred when fetching the script` | Chỉ xảy ra trong browser pane sandbox. Chrome thật: `navigator.serviceWorker.ready` pass; toàn bộ 35 file trong danh sách cache của `sw.js` đều tồn tại trong `www/`. **SW hoạt động bình thường.** |
| Modal tràn 32px, nút "Lưu trên máy" bị cắt | Do animation `sheet-in` (`translateY(32px)`) bị **pause** vì pane bị ẩn. Ở trạng thái nghỉ, modal cao đúng 624px trong viewport 640px, nút hiện đủ, scroll nội bộ hoạt động. **Layout modal đúng.** |
| Light theme chữ trắng trên nền trắng (ratio 1.07) | Sai số đo do pane không recalc style. Chrome thật, cả OS light và OS dark: `body` nền `rgb(243,246,255)`, chữ `rgb(23,32,51)`. **Light theme bình thường.** CSS cũng không có `@media (prefers-color-scheme)` nào để xung đột. |
| Nút trong thẻ Sự kiện cao 43px | Artifact tương tự. Chrome thật: **44px, đạt chuẩn.** |
| `.avatar` mặc định và `.avatar.peach` fail tương phản | Tính lại theo color stop thật của gradient: 4.78 và 4.67 — **đạt.** Chỉ `.avatar.yellow` fail (đã ghi ở P3-11). |
| Nhãn bottom-nav fail tương phản | Nhãn ở trạng thái **thường** đạt 6.36. Chỉ nhãn của mục **đang active** fail (đã ghi ở P3-11). |

Ngoài ra, những phần sau đã kiểm và **đạt**, không cần chỉnh: modal có `role="dialog"` + `aria-modal` + `aria-labelledby` tự gắn + focus trap hai chiều + Escape + trả focus về nơi mở; 7/7 route không có phần tử nào thiếu accessible name / `alt` / label; không tràn ngang ở mọi bề rộng đã test; validate phone/email/website kèm `aria-invalid` và focus vào field lỗi; combobox sự kiện có ARIA và điều hướng bàn phím đầy đủ; rollback khi lỗi storage; escape toàn bộ dữ liệu người dùng trước khi render (không thấy lỗ XSS); `npm audit` 0 vulnerability.

---

# 7. Quyết định phạm vi đã chốt

**Tính năng tự động tra thông tin doanh nghiệp (Company Research) là bắt buộc trong bản hoàn thiện project.** Quyết định này đã được chốt và phải được áp dụng nhất quán trong `BCARD_PRODUCTION_COMPLETION_PROMPT.md`, `TONG_QUAN_PROJECT_VA_PRODUCTION.md` và `TU_VAN_APP_DANH_BA_THU_2.md`.

Phạm vi bắt buộc gồm:

- Tự động enqueue sau khi contact đã lưu/xác nhận và có company candidate.
- Resolver an toàn, trả `unresolved` khi không đủ bằng chứng.
- Edge Function/server-side research, structured output và nguồn cho facts quan trọng.
- Cache TTL, chống job trùng, manual refresh và UI trạng thái đầy đủ.
- Tách personal contact khỏi public company facts; lỗi research không làm lỗi lưu card/contact.
- Test resolver, structured output, cache, authorization và end-to-end auto trigger.

Trong baseline code được audit ở phiên bản này, module trên chưa được triển khai. Đây là gap bắt buộc phải đóng trước khi kết luận project hoàn thiện. Chi phí model/search, căn cứ pháp lý, disclosure/consent và khai báo store vẫn là gate vận hành bắt buộc, không phải lý do hạ module thành tùy chọn.

---

# 8. Script kiểm chứng tương phản (dùng lại sau khi sửa P1-3, P3-11)

Lưu thành `test/contrast-check.js`, chạy khi server đang bật (`npm start`):

```js
const { chromium } = require("playwright-core");
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const baseUrl = process.env.BCARD_URL || "http://127.0.0.1:4173";

const CHECK = function () {
  function f(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(a) { return 0.2126 * f(a[0]) + 0.7152 * f(a[1]) + 0.0722 * f(a[2]); }
  function extract(s) {
    const parts = String(s).split("rgb"); const cols = [];
    for (let i = 1; i < parts.length; i++) {
      const o = parts[i].indexOf("("), c = parts[i].indexOf(")");
      if (o < 0 || c < 0) continue;
      const n = parts[i].substring(o + 1, c).split(",").map(parseFloat);
      if (n.length >= 3 && !isNaN(n[0])) cols.push({ rgb: [n[0], n[1], n[2]], a: n.length > 3 ? n[3] : 1 });
    }
    return cols;
  }
  function bgs(el) {
    let n = el;
    while (n) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        const st = extract(cs.backgroundImage).filter(c => c.a > 0.5).map(c => c.rgb);
        if (st.length) return st;
      }
      const bc = extract(cs.backgroundColor)[0];
      if (bc && bc.a > 0.5) return [bc.rgb];
      n = n.parentElement;
    }
    return [[255, 255, 255]];
  }
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const fails = [], seen = {}; let node;
  while (node = w.nextNode()) {
    const t = node.textContent.trim(); if (t.length < 2) continue;
    const el = node.parentElement; if (!el || !el.getClientRects().length) continue;
    if (el.closest('[aria-hidden="true"], .sr-only')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;
    const fg = extract(cs.color)[0]; if (!fg) continue;
    const L1 = lum(fg.rgb);
    let ratio = 99;
    bgs(el).forEach(bg => { const L2 = lum(bg); const r = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); if (r < ratio) ratio = r; });
    if (!isFinite(ratio)) continue;
    const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight) || 400;
    const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
    const key = el.tagName + String(el.className) + Math.round(ratio * 10);
    if (ratio < need && !seen[key]) {
      seen[key] = 1;
      fails.push({ txt: t.slice(0, 26), sel: (el.tagName + "." + String(el.className).split(" ")[0]).slice(0, 30),
                   ratio: Math.round(ratio * 100) / 100, need, px: Math.round(size) });
    }
  }
  return fails;
};

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const routes = ["home", "contacts", "cards", "events", "sync", "privacy", "account"];
  let total = 0;
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.evaluate(t => applyTheme(t), theme);
    await page.waitForTimeout(400);
    for (const r of routes) {
      await page.evaluate(x => setRoute(x), r);
      await page.waitForTimeout(250);
      const fails = await page.evaluate(CHECK);
      total += fails.length;
      if (fails.length) {
        console.log(theme + "/" + r + ": " + fails.length + " lỗi");
        fails.forEach(x => console.log("    " + x.ratio + " (cần " + x.need + ") " + x.px + "px  " + x.sel + '  "' + x.txt + '"'));
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(total === 0 ? "Contrast PASS: 7 route x 2 theme, khong co loi WCAG AA." : "Contrast FAIL: " + total + " loi.");
  process.exit(total === 0 ? 0 : 1);
})();
```

Lưu ý về cách đọc kết quả: với nền gradient, script lấy **color stop xấu nhất**. Đây là cách đo đúng cho yêu cầu "chữ phải đọc được trên toàn bộ nền", nhưng nghiêm hơn thực tế ở những chỗ chữ chỉ nằm trên phần nền đậm. Khi một dòng FAIL sát ngưỡng (ví dụ 4.4), hãy kiểm tra vị trí chữ thực tế trước khi đổi màu.
