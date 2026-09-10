const path = require("node:path");
const { createWorker } = require("tesseract.js");
const parser = require("../ocr.js");

const imagePath = process.env.CARD_IMAGE;
if (!imagePath) throw new Error("Set CARD_IMAGE to a local image path");

(async () => {
  const worker = await createWorker(["vie", "eng"], 1, {
    langPath: path.join(__dirname, "..", "www", "vendor", "tesseract", "lang")
  });
  try {
    for (const psm of [3, 6, 11, 12]) {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const { data } = await worker.recognize(imagePath);
      console.log(`\n=== PSM ${psm} · ${Math.round(data.confidence)}% ===`);
      console.log(data.text.trim());
      console.log(parser.parseBusinessCardText(data.text));
    }
  } finally {
    await worker.terminate();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
