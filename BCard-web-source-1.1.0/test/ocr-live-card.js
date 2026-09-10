const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");

const imagePath = process.env.CARD_IMAGE;
const backImagePath = process.env.BACK_IMAGE;
const baseUrl = process.env.BCARD_URL || "http://127.0.0.1:4173";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

if (!imagePath || !fs.existsSync(imagePath)) {
  throw new Error("Đặt CARD_IMAGE thành đường dẫn ảnh namecard cần kiểm tra");
}

const mime = path.extname(imagePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
const dataUrl = `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;

const backDataUrl = backImagePath && fs.existsSync(backImagePath)
  ? "data:" + (path.extname(backImagePath).toLowerCase() === ".png" ? "image/png" : "image/jpeg") + ";base64," + fs.readFileSync(backImagePath).toString("base64")
  : "";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const result = await page.evaluate(({ front, back }) => window.BCardOCR.recognize({ front, back }), { front: dataUrl, back: backDataUrl });
    console.log(JSON.stringify({
      name: result.name,
      role: result.role,
      company: result.company,
      phone: result.phone,
      email: result.email,
      website: result.website,
      confidence: result.confidence,
      language: result.language,
      rawText: result.rawText
    }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
