const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const baseUrl = process.env.BCARD_URL || "http://127.0.0.1:4173";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function recognizeSyntheticCard(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 820;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#0b1633";
    context.font = "700 92px Arial";
    context.fillText("TRAN MINH ANH", 80, 150);
    context.font = "600 54px Arial";
    context.fillText("Business Development Director", 80, 265);
    context.fillText("NOVA SOLUTIONS", 80, 370);
    context.font = "500 48px Arial";
    context.fillText("0903456789", 80, 500);
    context.fillText("anh.tran@nova.vn", 80, 595);
    context.fillText("www.nova.vn", 80, 690);
    return window.BCardOCR.recognize({ front: canvas.toDataURL("image/png"), back: "" });
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const browserErrors = [];
  page.on("console", message => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", error => browserErrors.push(error.message));
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const result = await recognizeSyntheticCard(page);
    assert(result.rawText.length > 20, "OCR không trả về raw text");
    assert(result.email === "anh.tran@nova.vn", `OCR email sai: ${result.email}`);
    assert(result.phone.replace(/\D/g, "").includes("0903456789"), `OCR số điện thoại sai: ${result.phone}`);
    assert(result.language === "vie+eng", "OCR không chạy model Việt/Anh");
    assert(!browserErrors.some(text => /content security policy|refused|worker|wasm/i.test(text)), `Lỗi CSP/worker/WASM: ${browserErrors.join(" | ")}`);
    await page.evaluate(() => navigator.serviceWorker?.ready);
    await page.reload({ waitUntil: "networkidle" });
    await page.context().setOffline(true);
    const offlineResult = await recognizeSyntheticCard(page);
    assert(offlineResult.email === "anh.tran@nova.vn", `OCR offline thất bại: ${offlineResult.email}`);
    fs.writeFileSync(path.join(process.cwd(), "BCard_OCR_Runtime_Evidence_v1.1.0.json"), JSON.stringify({ result, offlineResult, browserErrors }, null, 2));
    console.log(`OCR runtime PASS: vie+eng, confidence ${result.confidence}%, online/offline nhận đúng, CSP/worker/WASM sạch.`);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
