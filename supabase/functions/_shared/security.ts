export const CORS_HEADERS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

const PRIVATE_V4 = /^(?:0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|(?:22[4-9]|23\d|24\d|25[0-5])\.)/;
const PRIVATE_V6 = /^(?:::1$|fc|fd|fe[89ab])/i;
export function safePublicUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("HTTPS_REQUIRED");
  if (url.username || url.password || url.port) throw new Error("UNSAFE_URL");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || PRIVATE_V4.test(host) || PRIVATE_V6.test(host)) throw new Error("PRIVATE_NETWORK_BLOCKED");
  return url;
}

async function assertPublicDns(hostname: string) {
  const lookups = await Promise.allSettled([Deno.resolveDns(hostname, "A"), Deno.resolveDns(hostname, "AAAA")]);
  for (const lookup of lookups) if (lookup.status === "fulfilled") for (const address of lookup.value) if (PRIVATE_V4.test(address) || PRIVATE_V6.test(address)) throw new Error("PRIVATE_NETWORK_BLOCKED");
}

export async function fetchBounded(urlValue: string, timeoutMs = 8000, maxBytes = 1_000_000): Promise<{ url: string; text: string; contentType: string }> {
  let current = safePublicUrl(urlValue);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicDns(current.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(current, { signal: controller.signal, redirect: "manual", headers: { "user-agent": "BCardResearchBot/1.0", accept: "text/html,application/xhtml+xml" } }).finally(() => clearTimeout(timeout));
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("REDIRECT_REJECTED");
      current = safePublicUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`UPSTREAM_${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("UNSUPPORTED_CONTENT_TYPE");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new Error("RESPONSE_TOO_LARGE");
    const reader = response.body?.getReader(); let length = 0; const chunks: Uint8Array[] = [];
    while (reader) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.length; if (length > maxBytes) { await reader.cancel(); throw new Error("RESPONSE_TOO_LARGE"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return { url: current.toString(), text: new TextDecoder().decode(bytes), contentType };
  }
  throw new Error("REDIRECT_REJECTED");
}

export function cleanHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").slice(0, 60_000);
}

export function validateCandidate(input: unknown) {
  const raw = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const company_name = String(raw.company_name || "").trim().slice(0, 300);
  const domain = String(raw.domain || "").trim().toLowerCase().replace(/^www\./, "").slice(0, 253);
  const website = safePublicUrl(String(raw.website || `https://${domain}`)).toString();
  if (!company_name || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) throw new Error("INVALID_CANDIDATE");
  if (new URL(website).hostname.replace(/^www\./, "") !== domain) throw new Error("DOMAIN_MISMATCH");
  return { company_name, domain, website };
}
