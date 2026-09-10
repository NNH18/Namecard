const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const outputRoot = path.join(projectRoot, "www");
const sourceFiles = ["index.html", "styles.css", "logic.js", "ocr.js", "app.js", "manifest.json", "icon.svg", "icon-192.png", "icon-512.png", "sw.js"];

fs.mkdirSync(outputRoot, { recursive: true });
fs.mkdirSync(path.join(outputRoot, "vendor"), { recursive: true });

for (const file of sourceFiles) {
  fs.copyFileSync(path.join(projectRoot, file), path.join(outputRoot, file));
}

const vendorFiles = [
  [path.join(projectRoot, "node_modules", "jquery", "dist", "jquery.min.js"), "jquery.min.js"],
  [path.join(projectRoot, "node_modules", "lucide", "dist", "umd", "lucide.min.js"), "lucide.min.js"]
];

for (const [sourcePath, target] of vendorFiles) {
  fs.copyFileSync(sourcePath, path.join(outputRoot, "vendor", target));
}

const ocrTarget = path.join(outputRoot, "vendor", "tesseract");
const ocrCoreTarget = path.join(ocrTarget, "core");
const ocrLangTarget = path.join(ocrTarget, "lang");
fs.mkdirSync(ocrCoreTarget, { recursive: true });
fs.mkdirSync(ocrLangTarget, { recursive: true });
fs.copyFileSync(path.join(projectRoot, "node_modules", "tesseract.js", "dist", "tesseract.min.js"), path.join(ocrTarget, "tesseract.min.js"));
fs.copyFileSync(path.join(projectRoot, "node_modules", "tesseract.js", "dist", "worker.min.js"), path.join(ocrTarget, "worker.min.js"));
for (const file of fs.readdirSync(path.join(projectRoot, "node_modules", "tesseract.js-core"))) {
  if (/^tesseract-core.*\.(?:js|wasm)$/.test(file)) {
    fs.copyFileSync(path.join(projectRoot, "node_modules", "tesseract.js-core", file), path.join(ocrCoreTarget, file));
  }
}
for (const language of ["vie", "eng"]) {
  fs.copyFileSync(
    path.join(projectRoot, "node_modules", "@tesseract.js-data", language, "4.0.0_best_int", `${language}.traineddata.gz`),
    path.join(ocrLangTarget, `${language}.traineddata.gz`)
  );
}

for (const family of ["nunito", "dm-sans"]) {
  const fontSource = path.join(projectRoot, "node_modules", "@fontsource-variable", family);
  const fontTarget = path.join(outputRoot, "vendor", "fonts", family);
  fs.mkdirSync(fontTarget, { recursive: true });
  fs.copyFileSync(path.join(fontSource, "index.css"), path.join(fontTarget, "index.css"));
  fs.cpSync(path.join(fontSource, "files"), path.join(fontTarget, "files"), { recursive: true });
}

console.log("Mobile web assets built in www/");
