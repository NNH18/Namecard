const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "www");
const rootBoundary = `${root}${path.sep}`;
const port = Number(process.env.PORT || 4173);
const contentSecurityPolicy = "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' blob:; form-action 'self'; frame-ancestors 'none'";
const securityHeaders = {
  "Content-Security-Policy": contentSecurityPolicy,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()"
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

http.createServer((req, res) => {
  let requested;
  try { requested = decodeURIComponent((req.url || "/").split("?")[0]); }
  catch {
    res.writeHead(400, securityHeaders);
    res.end("Bad request");
    return;
  }
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(rootBoundary) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, securityHeaders);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { ...securityHeaders, "Content-Type": types[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
  fs.createReadStream(filePath).pipe(res);
}).listen(port, () => console.log(`BCard is running at http://localhost:${port}`));
