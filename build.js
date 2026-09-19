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

fs.cpSync(path.join(projectRoot, "lib"), path.join(outputRoot, "lib"), { recursive: true });
const publicConfig = {
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || "",
  AUTO_RESEARCH: process.env.BCARD_AUTO_RESEARCH || "true",
  COMPANY_RESEARCH_CACHE_DAYS: process.env.BCARD_RESEARCH_CACHE_DAYS || "30",
  MAX_IMAGE_BYTES: process.env.BCARD_MAX_IMAGE_BYTES || "15728640"
};
if (Object.keys(process.env).some(key => ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"].includes(key) && publicConfig[key])) throw new Error("Server secret cannot be written to web assets");
fs.writeFileSync(path.join(outputRoot, "config.public.js"), `window.BCARD_PUBLIC_CONFIG=${JSON.stringify(publicConfig)};\n`);
if (publicConfig.SUPABASE_URL) {
  const origin = new URL(publicConfig.SUPABASE_URL).origin;
  const builtIndex = path.join(outputRoot, "index.html");
  fs.writeFileSync(builtIndex, fs.readFileSync(builtIndex, "utf8").replace("https://*.supabase.co", origin));
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
