(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BCardOCR = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const ROLE_WORDS = /(?:ceo|director|manager|founder|owner|officer|president|lead|head|engineer|specialist|consultant|advisor|sales|marketing|business development|giám đốc|trưởng|quản lý|sáng lập|chuyên viên|cố vấn|kinh doanh)/i;
  const COMPANY_WORDS = /(?:company|corporation|corp\.?|co\.?\s*,?\s*ltd|limited|group|studio|solutions?|capital|technology|technologies|media|agency|jsc|llc|inc\.?|công ty|tập đoàn|tnhh|cổ phần)/i;

  function cleanLine(value) {
    return String(value || "").replace(/[|•·]+/g, " ").replace(/\s+/g, " ").trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function normalizeWebsite(value) {
    return cleanLine(value).replace(/^[^a-z0-9]+|[^a-z0-9/.-]+$/gi, "").replace(/^www\./i, "");
  }

  function scoreName(line, index, lines) {
    if (!line || /@|https?:|www\.|\d{3}/i.test(line) || ROLE_WORDS.test(line) || COMPANY_WORDS.test(line) || /\b(?:division|department|branch|business unit)\b/i.test(line)) return -1;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 6) return -1;
    const letters = (line.match(/[A-Za-zÀ-ỹĐđ]/g) || []).length;
    if (letters < line.length * 0.65) return -1;
    const titleWords = words.filter(word => /^[A-ZÀ-ỸĐ][a-zà-ỹđ'-]*$/u.test(word)).length;
    const upperRatio = letters ? (line.match(/[A-ZÀ-ỸĐ]/gu) || []).length / letters : 0;
    const roleNearby = lines.slice(index + 1, index + 4).some(candidate => ROLE_WORDS.test(candidate));
    const roleImmediatelyAfter = ROLE_WORDS.test(lines[index + 1] || "");
    const sloganPenalty = /\b(?:connecting|buyers?|sellers?|globally|planting|seeds?|growth|quality|trust|together|innovation|since|we are|of the)\b/i.test(line) ? 9 : 0;
    return titleWords * 2 + (upperRatio > 0.75 ? 8 : 0) + (roleNearby ? 5 : 0) + (roleImmediatelyAfter ? 6 : 0) - Math.abs(words.length - 3) - sloganPenalty;
  }

  function extractPhone(value) {
    const candidates = String(value || "").match(/(?:\+?\(?\d[\d\s().-]{6,}\d)/g) || [];
    return candidates.map(cleanLine).find(candidate => {
      const digits = candidate.replace(/\D/g, "");
      return digits.length >= 8 && digits.length <= 15;
    }) || "";
  }

  function cleanRole(line) {
    const value = cleanLine(line);
    const executive = value.match(/\bCEO(?:\s+(?:&|and)?\s*Co[\s-]*Founder)?\b/i);
    if (executive) return executive[0].replace(/^ceo/i, "CEO").replace(/co[\s-]*founder/i, "Co Founder").replace(/\s+/g, " ");
    const english = value.match(/\b(?:(?:assistant|deputy|senior|junior|general|regional|country|business development|sales|marketing|product|project|account|investment|creative|partnership)\s+)*(?:director|manager|founder|owner|officer|president|lead|head|engineer|specialist|consultant|advisor)\b/i);
    return english ? english[0].replace(/\b\w/g, letter => letter.toUpperCase()) : value;
  }

  function editDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1)
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
  }

  function inferBrandCompany(lines, nameLine, email) {
    if (!email) return "";
    const domainLabel = email.split("@")[1].split(".")[0].toLowerCase();
    const compactDomain = domainLabel.replace(/[^a-z0-9]/g, "");
    const candidate = lines.find(line => {
      if (line === nameLine || ROLE_WORDS.test(line) || /@|www\.|https?:|\d{3}/i.test(line)) return false;
      if (/\b(?:connecting|buyers?|sellers?|globally|quality|trust|member)\b/i.test(line)) return false;
      const words = line
        .replace(/[^A-Za-z0-9 ]/g, " ")
        .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/\s+/)
        .filter(Boolean);
      if (!words.length || words.length > 4) return false;
      const compactLine = words.join("").toLowerCase().replace(/[^a-z0-9]/g, "");
      const domainPrefix = compactDomain.slice(0, compactLine.length);
      return compactLine.length >= 4 && (compactDomain.startsWith(compactLine) || editDistance(compactLine, domainPrefix) <= 2);
    });
    if (!candidate) return "";
    const words = candidate
      .replace(/[^A-Za-z0-9 ]/g, " ")
      .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean);
    const title = value => value.replace(/\b\w/g, letter => letter.toUpperCase());
    let offset = 0;
    const domainWords = words.map(word => {
      const segment = compactDomain.slice(offset, offset + word.length);
      offset += word.length;
      return title(segment);
    });
    const suffix = compactDomain.slice(offset);
    return cleanLine([...domainWords, suffix ? title(suffix) : ""].filter(Boolean).join(" "));
  }

  function parseBusinessCardText(text) {
    const rawText = String(text || "").replace(/\r/g, "").trim();
    const normalizedText = rawText.replace(/\s*@\s*/g, "@").replace(/\s*\.\s*(?=[a-z]{2,}\b)/gi, ".");
    const lines = unique(normalizedText.split("\n").map(cleanLine));
    const email = (normalizedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [""])[0].toLowerCase();
    const mobileLine = lines.find(line => /\b(?:mobile|mob|di động|đtdđ)\b/i.test(line));
    const telephoneLine = lines.find(line => /\b(?:tel|telephone|phone|điện thoại)\b/i.test(line));
    const genericPhoneLine = lines.find(line => !/tax|floor|street|str\.?|road|unit|code/i.test(line) && extractPhone(line));
    const phone = extractPhone(mobileLine) || extractPhone(telephoneLine) || extractPhone(genericPhoneLine);
    const websiteCandidates = normalizedText.match(/(?:https?:\/\/|www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s]*)?/gi) || [];
    const explicitWebsite = normalizeWebsite(websiteCandidates.find(value => {
      const candidate = value.toLowerCase();
      return !value.includes("@") && !email.startsWith(`${candidate}@`) && !email.endsWith(`@${candidate}`);
    }) || "");
    const website = explicitWebsite || (email ? email.split("@")[1] : "");
    const roleLine = lines.find(line => ROLE_WORDS.test(line) && !/@|https?:|www\./i.test(line)) || "";
    const role = cleanRole(roleLine);
    const companyMatch = lines.filter(line => line !== roleLine && COMPANY_WORDS.test(line)).sort((a, b) => {
      const score = value => (/company limited|corporation|công ty|tập đoàn|tnhh|cổ phần/i.test(value) ? 8 : 0) + ((value.match(/[A-ZÀ-ỸĐ]/gu) || []).length / Math.max(1, (value.match(/[A-Za-zÀ-ỹĐđ]/g) || []).length)) * 4;
      return score(b) - score(a);
    })[0] || "";
    const name = lines.map((line, index) => ({ line, score: scoreName(line, index, lines) })).sort((a, b) => b.score - a.score)[0];
    const nameValue = name && name.score >= 1 ? name.line : "";
    const company = companyMatch || inferBrandCompany(lines, nameValue, email);
    return {
      name: nameValue,
      role,
      company,
      phone,
      email,
      website,
      rawText
    };
  }

  function assetUrl(relative) {
    if (!root.document) return relative;
    return new URL(relative, root.document.baseURI).href.replace(/\/$/, "");
  }

  async function preprocessImage(source) {
    if (!root.document || typeof source !== "string" || !source.startsWith("data:image/")) return source;
    try {
      const image = await new Promise((resolve, reject) => {
        const element = new root.Image();
        element.onload = () => resolve(element);
        element.onerror = reject;
        element.src = source;
      });
      const scale = Math.max(1, Math.min(4, 1800 / image.naturalWidth));
      const canvas = root.document.createElement("canvas");
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const histogram = new Uint32Array(256);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const gray = Math.round(pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114);
        histogram[gray] += 1;
      }
      const total = canvas.width * canvas.height;
      let low = 0; let high = 255; let count = 0;
      while (low < 255 && (count += histogram[low]) < total * 0.02) low += 1;
      count = 0;
      while (high > 0 && (count += histogram[high]) < total * 0.02) high -= 1;
      const range = Math.max(24, high - low);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
        const enhanced = Math.max(0, Math.min(255, ((gray - low) * 255) / range));
        pixels.data[index] = enhanced;
        pixels.data[index + 1] = enhanced;
        pixels.data[index + 2] = enhanced;
      }
      context.putImageData(pixels, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.94);
    } catch {
      return source;
    }
  }

  async function recognize(images, onProgress = function () {}) {
    if (!root.Tesseract || typeof root.Tesseract.createWorker !== "function") {
      throw new Error("Bộ OCR cục bộ chưa được tải");
    }
    const sources = [images.front, images.back].filter(Boolean);
    if (!sources.length) throw new Error("Không có ảnh để nhận dạng");
    let currentPage = 0;
    const worker = await root.Tesseract.createWorker(["vie", "eng"], 1, {
      workerPath: assetUrl("vendor/tesseract/worker.min.js"),
      corePath: assetUrl("vendor/tesseract/core"),
      langPath: assetUrl("vendor/tesseract/lang"),
      logger(message) {
        const localProgress = Number(message.progress || 0);
        onProgress({
          status: message.status || "Đang chuẩn bị OCR",
          progress: Math.min(1, (currentPage + localProgress) / sources.length),
          page: currentPage + 1,
          pages: sources.length
        });
      }
    });
    const results = [];
    try {
      await worker.setParameters({ tessedit_pageseg_mode: "3", preserve_interword_spaces: "1", user_defined_dpi: "300" });
      for (let index = 0; index < sources.length; index += 1) {
        currentPage = index;
        onProgress({ status: `Đang đọc mặt ${index + 1}/${sources.length}`, progress: index / sources.length, page: index + 1, pages: sources.length });
        const prepared = await preprocessImage(sources[index]);
        const result = await worker.recognize(prepared);
        results.push(result.data);
      }
    } finally {
      await worker.terminate();
    }
    const rawText = results.map(item => item.text || "").join("\n").trim();
    const confidenceValues = results.map(item => Number(item.confidence)).filter(Number.isFinite);
    return {
      ...parseBusinessCardText(rawText),
      confidence: confidenceValues.length ? Math.round(confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length) : 0,
      language: "vie+eng"
    };
  }

  return { cleanLine, parseBusinessCardText, recognize };
}));
