const { chromium } = require("playwright-core");
const fs = require("node:fs");

const frontPath = process.env.CARD_IMAGE;
const backPath = process.env.BACK_IMAGE;
const baseUrl = process.env.BCARD_URL || "http://127.0.0.1:4173";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

if (!frontPath || !backPath || !fs.existsSync(frontPath) || !fs.existsSync(backPath)) {
  throw new Error("Đặt CARD_IMAGE và BACK_IMAGE thành hai mặt namecard cần kiểm tra");
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(baseUrl + "?form-ocr=" + Date.now(), { waitUntil: "networkidle" });
    await page.locator("#mobileScan").click();
    await page.locator("#frontFile").setInputFiles(frontPath);
    await page.locator("#backFile").setInputFiles(backPath);
    await page.locator("#scanContinue").click();
    await page.locator("#ocrStatus.complete").waitFor({ timeout: 120000 });
    const fields = await page.evaluate(() => ({
      name: document.getElementById("ocrName").value,
      role: document.getElementById("ocrRole").value,
      company: document.getElementById("ocrCompany").value,
      phone: document.getElementById("ocrPhone").value,
      email: document.getElementById("ocrEmail").value,
      website: document.getElementById("ocrWebsite").value
    }));
    const expected = {
      name: process.env.EXPECTED_NAME,
      role: process.env.EXPECTED_ROLE,
      company: process.env.EXPECTED_COMPANY
    };
    for (const [field, value] of Object.entries(expected)) {
      if (value && fields[field] !== value) throw new Error(field + " không khớp: " + fields[field]);
    }
    console.log(JSON.stringify(fields, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
