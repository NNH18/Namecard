const { chromium } = require("playwright");
const path = require("node:path");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
  try {
    for (const size of [192, 512]) {
      const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
      await page.goto(process.env.BCARD_URL || "http://127.0.0.1:4173/icon.svg", { waitUntil: "networkidle" });
      await page.locator("svg").screenshot({ path: path.join(process.cwd(), `icon-${size}.png`), omitBackground: true });
      await page.close();
    }
    console.log("Generated PWA icons: 192px, 512px.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
