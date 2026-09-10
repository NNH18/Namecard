const { chromium } = require("playwright-core");
const path = require("node:path");
const fs = require("node:fs");

const baseUrl = process.env.BCARD_URL || "http://127.0.0.1:4173";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function trackCspErrors(page) {
  const errors = [];
  page.on("console", message => {
    const text = message.text();
    if (/style-src|Refused to apply inline style/i.test(text)) errors.push(text);
  });
  return errors;
}

async function captureContacts(browser, width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const cspErrors = trackCspErrors(page);
  const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
  assert(response.headers()["content-security-policy"], "Thiếu Content-Security-Policy");
  await page.locator(".bottom-nav [data-route='contacts']").click();
  await page.waitForTimeout(100);
  const layout = await page.evaluate(() => {
    const heading = document.querySelector(".page-head h1").getBoundingClientRect();
    const topbar = document.querySelector(".topbar").getBoundingClientRect();
    const chips = [...document.querySelectorAll(".filter-row .chip")];
    const lastChip = chips.at(-1).getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headingTop: heading.top,
      topbarBottom: topbar.bottom,
      lastChipRight: lastChip.right,
      viewportWidth: window.innerWidth
    };
  });
  assert(layout.overflow <= 1, `${width}px bị tràn ngang ${layout.overflow}px`);
  assert(layout.headingTop >= layout.topbarBottom, `${width}px tiêu đề bị topbar che`);
  assert(layout.lastChipRight <= layout.viewportWidth, `${width}px chip cuối bị cắt`);
  assert(cspErrors.length === 0, `${width}px có lỗi CSP: ${cspErrors.join(" | ")}`);
  await page.screenshot({ path: path.join(process.cwd(), `audit-v1.1.0-${width}-contacts.png`), fullPage: true });
  await page.close();
}

async function verifyDuplicateFlow(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const cspErrors = trackCspErrors(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.BCardOCR.recognize = async (_images, onProgress) => {
      onProgress({ status: "recognizing text", progress: 1, page: 1, pages: 1 });
      return { name: "", role: "", company: "", phone: "", email: "", website: "", rawText: "OCR TEST", confidence: 99, language: "vie+eng" };
    };
  });
  await page.locator("#mobileScan").click();
  assert(await page.locator("[data-camera-target]").count() === 2, "Thiếu nút camera cho hai mặt card");
  await page.locator("#frontFile").setInputFiles(path.join(process.cwd(), "icon.svg"));
  await page.locator("#backBlank").check();
  await page.locator("#scanContinue").click();
  await page.locator("#ocrStatus.complete").waitFor();
  assert(await page.locator("#ocrEvent").inputValue() === "Vietnam Innovation Summit", "Sự kiện đang dùng không được tự điền");
  assert(await page.locator(".field-hint").filter({ hasText: "Vietnam Innovation Summit" }).count() === 1, "Thiếu giải thích nguồn sự kiện tự điền");
  await page.locator("#ocrName").fill("Trần Minh Anh");
  await page.locator("#ocrPhone").fill("0903 456 789");
  await page.locator("#ocrConfirmed").check();
  await page.getByText("Đã xác nhận · độ tin cậy 100%", { exact: true }).waitFor();
  await page.locator("#saveScan").click();
  await page.getByRole("heading", { name: "Liên kết hay tạo mới?" }).waitFor();
  const removeChoice = page.locator('input[name="removeTarget"]').first();
  assert(await removeChoice.count() === 1, "Không có lựa chọn tạo proposal REMOVE");
  await removeChoice.check();
  await page.locator("#attachExisting").click();
  await page.getByRole("heading", { name: "Đề xuất cập nhật" }).waitFor();
  const cards = await page.locator(".business-card").count();
  const proposals = await page.locator(".proposal").count();
  assert(cards >= 2, "Liên kết không giữ card snapshot mới");
  assert(proposals >= 1, "Liên kết không tạo đề xuất PENDING");
  const removeProposal = page.locator(".proposal").filter({ hasText: "REMOVE" }).first();
  assert(await removeProposal.count() === 1, "Luồng UI không sinh proposal REMOVE");
  await removeProposal.getByRole("button", { name: "Chấp nhận" }).click();
  assert(await page.getByText("REVOKED", { exact: true }).count() === 0, "Enum REVOKED bị lộ trên UI");
  assert(await page.locator(".info-section").filter({ hasText: "anh.tran@nova.vn" }).count() === 0, "Method REVOKED vẫn hiện trong danh sách ACTIVE");
  await page.locator(".bottom-nav [data-route='cards']").click();
  const scannedImage = page.locator(".business-card .card-visual > img").first();
  await scannedImage.waitFor();
  const computedStyle = await scannedImage.evaluate(image => {
    const style = getComputedStyle(image);
    const imageRect = image.getBoundingClientRect();
    const parentRect = image.parentElement.getBoundingClientRect();
    return {
      position: style.position,
      inset: [style.top, style.right, style.bottom, style.left],
      objectFit: style.objectFit,
      imageSize: [Math.round(imageRect.width), Math.round(imageRect.height)],
      frameSize: [Math.round(parentRect.width), Math.round(parentRect.height)],
      overflow: getComputedStyle(image.parentElement).overflow
    };
  });
  assert(computedStyle.position === "absolute", "Ảnh card không có position:absolute");
  assert(computedStyle.objectFit === "cover", "Ảnh card không có object-fit:cover");
  assert(computedStyle.imageSize[0] === computedStyle.frameSize[0] && computedStyle.imageSize[1] === computedStyle.frameSize[1], "Ảnh card không phủ đúng khung");
  await page.locator(".business-card").first().click();
  await page.locator("#relinkCard").click();
  await page.locator("[data-relink-contact='ct_khoa']").click();
  await page.locator(".page-head h1").filter({ hasText: "Lê Quốc Khoa" }).waitFor();
  assert(cspErrors.length === 0, `Luồng scan có lỗi CSP: ${cspErrors.join(" | ")}`);
  fs.writeFileSync(path.join(process.cwd(), "BCard_ComputedStyle_Evidence_v1.1.0.json"), JSON.stringify({ computedStyle, cspErrors }, null, 2));
  await page.screenshot({ path: path.join(process.cwd(), "audit-v1.1.0-card-image.png"), fullPage: true });
  await page.close();
}

async function verifyActiveEventAutofill(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 820 }, deviceScaleFactor: 1 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelector(".sidebar [data-route='events']").click());
  await page.locator("[data-action='set-active-event'][data-id='evt_02']").click();
  await page.getByText("Đang tự điền khi quét", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.BCardOCR.recognize = async () => ({ name: "Test Event", role: "", company: "", phone: "0901234567", email: "test@example.com", website: "example.com", rawText: "", confidence: 90, language: "vie+eng" });
  });
  await page.evaluate(() => document.getElementById("mobileScan").click());
  await page.locator("#frontFile").setInputFiles(path.join(process.cwd(), "icon.svg"));
  await page.locator("#backBlank").check();
  await page.locator("#scanContinue").click();
  await page.locator("#ocrStatus.complete").waitFor();
  assert(await page.locator("#ocrEvent").inputValue() === "Founder Dinner Saigon", "Sự kiện vừa chọn không được tự điền ở lần quét tiếp theo");
  assert(await page.locator("#ocrEvent").evaluate(element => element.tagName) === "INPUT", "Field Sự kiện chưa chuyển sang input");
  assert(await page.locator("#ocrEvent").getAttribute("role") === "combobox", "Field Sự kiện thiếu semantics combobox");
  await page.locator("#ocrEvent").click();
  assert(await page.locator("#ocrEventListbox [role='option']").count() >= 3, "Combobox Sự kiện thiếu dropdown hiện có");
  await page.locator("#ocrEvent").press("ArrowDown");
  assert(await page.locator("#ocrEventListbox [role='option'][aria-selected='true']").count() === 1, "Combobox không công bố option đang active");
  await page.getByRole("option", { name: "Vietnam Innovation Summit", exact: true }).click();
  assert(await page.locator("#ocrEvent").inputValue() === "Vietnam Innovation Summit", "Không chọn được sự kiện trong dropdown");
  await page.locator("#ocrEvent").fill("Hội nghị tự nhập 2026");
  await page.locator(".event-combobox-option.create").click();
  assert(await page.locator("#ocrEvent").inputValue() === "Hội nghị tự nhập 2026", "Không tạo được giá trị Sự kiện mới");
  await page.locator("#saveScan").click();
  await page.getByText("Hội nghị tự nhập 2026", { exact: true }).waitFor();
  assert(await page.getByText("Chưa xác nhận", { exact: true }).count() >= 1, "Không lưu được scan để kiểm tra sau");
  await page.locator(".business-card[data-card]").first().click();
  await page.locator("#confirmCardReview").click();
  assert(await page.locator(".profile-tags .tag").filter({ hasText: "Chưa xác nhận" }).count() === 0, "Không hoàn tất được luồng kiểm tra sau");
  await page.evaluate(() => document.querySelector(".sidebar [data-route='events']").click());
  await page.getByRole("heading", { name: "Hội nghị tự nhập 2026", exact: true }).waitFor();
  await page.close();
}

async function verifyPersistenceRollback(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const cspErrors = trackCspErrors(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".bottom-nav [data-route='contacts']").click();
  await page.locator("[data-contact='ct_anh']").click();
  await page.evaluate(() => {
    Storage.prototype.setItem = function () { throw new DOMException("Quota full", "QuotaExceededError"); };
  });
  await page.locator("[data-action='add-note']").click();
  await page.locator("#noteText").fill("Ghi chú không được phép báo lưu thành công");
  await page.locator("#saveNote").click();
  await page.getByText("Không thể lưu trên thiết bị", { exact: true }).waitFor();
  assert(await page.locator(".modal").isVisible(), "Modal bị đóng dù lưu thất bại");
  const persisted = await page.evaluate(() => localStorage.getItem("memento-p0-data-v1") || "");
  assert(!persisted.includes("Ghi chú không được phép báo lưu thành công"), "Dữ liệu lỗi vẫn bị ghi nhận");
  assert(cspErrors.length === 0, `Rollback có lỗi CSP: ${cspErrors.join(" | ")}`);
  await page.close();
}

async function captureHome(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const cspErrors = trackCspErrors(page);
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.locator(".hero-card-stage").hover();
  await page.waitForTimeout(100);
  assert(cspErrors.length === 0, `Hero interaction có lỗi CSP: ${cspErrors.join(" | ")}`);
  await page.screenshot({ path: path.join(process.cwd(), "audit-v1.1.0-390-home.png"), fullPage: true });
  await page.locator("#themeButton").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(process.cwd(), "audit-v1.1.0-390-home-dark.png"), fullPage: true });
  await page.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    await captureHome(browser);
    await captureContacts(browser, 320, 900);
    await captureContacts(browser, 390, 844);
    await captureContacts(browser, 1024, 820);
    await verifyDuplicateFlow(browser);
    await verifyActiveEventAutofill(browser);
    await verifyPersistenceRollback(browser);
    console.log("Visual smoke PASS: 320/390/1024, CSP sạch, ảnh card đúng khung, combobox creatable/keyboard, review sau, relink, ADD/UPDATE/REMOVE và rollback.");
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
