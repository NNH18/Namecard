(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BCardLogic = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeName(value = "") {
    return String(value)
      .trim()
      .toLocaleLowerCase("vi")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function normalizePhone(value = "") {
    const digits = String(value).replace(/\D/g, "");
    return digits.startsWith("84") && digits.length >= 10 ? `0${digits.slice(2)}` : digits;
  }

  function normalizeEmail(value = "") {
    return String(value).trim().toLocaleLowerCase("en");
  }

  function isValidPhone(value = "") {
    if (!value) return true;
    const digits = normalizePhone(value);
    return /^\+?[0-9][0-9\s().-]{6,20}$/.test(String(value).trim()) && digits.length >= 8 && digits.length <= 15;
  }

  function isValidEmail(value = "") {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(normalizeEmail(value));
  }

  function safeWebsiteUrl(value = "") {
    const raw = String(value).trim();
    if (!raw) return "";
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function activeMethods(contact, kind) {
    return (contact.methods || []).filter(method => method.kind === kind && method.status === "ACTIVE");
  }

  function findDuplicateCandidates(contacts, fields) {
    const name = normalizeName(fields.name);
    const phone = normalizePhone(fields.phone);
    const email = normalizeEmail(fields.email);
    return contacts
      .filter(contact => contact.lifecycle !== "DELETED")
      .map(contact => {
        const reasons = [];
        if (phone && activeMethods(contact, "PHONE").some(method => normalizePhone(method.value) === phone)) reasons.push("cùng số điện thoại");
        if (email && activeMethods(contact, "EMAIL").some(method => normalizeEmail(method.value) === email)) reasons.push("cùng email");
        if (name && normalizeName(contact.name) === name) reasons.push("cùng họ tên");
        const score = reasons.reduce((total, reason) => total + (reason === "cùng họ tên" ? 1 : 3), 0);
        return { contact, reasons, score };
      })
      .filter(candidate => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.contact.name.localeCompare(b.contact.name, "vi"));
  }

  function buildAttachProposals(contact, fields, source, makeId) {
    const proposals = [];
    const createdAt = new Date().toISOString();
    const base = { contactId: contact.id, source, status: "PENDING", targetVersion: Number(contact.version || 0), createdAt };
    const add = (target, value, metadata = {}) => proposals.push({
      id: makeId(), ...base, kind: "ADD", target, value, metadata
    });
    if (fields.name && normalizeName(fields.name) !== normalizeName(contact.name)) {
      proposals.push({ id: makeId(), ...base, kind: "UPDATE", target: "NAME", targetId: contact.id, value: fields.name, currentValue: contact.name });
    }
    if (fields.phone && !activeMethods(contact, "PHONE").some(method => normalizePhone(method.value) === normalizePhone(fields.phone))) {
      add("PHONE", fields.phone, { label: "Di động" });
    }
    if (fields.email && !activeMethods(contact, "EMAIL").some(method => normalizeEmail(method.value) === normalizeEmail(fields.email))) {
      add("EMAIL", fields.email, { label: "Công việc" });
    }
    if (fields.personalUrl && safeWebsiteUrl(fields.personalUrl) && safeWebsiteUrl(fields.personalUrl) !== safeWebsiteUrl(contact.personalUrl)) {
      if (contact.personalUrl) proposals.push({ id: makeId(), ...base, kind: "UPDATE", target: "PERSONAL_URL", targetId: contact.id, value: fields.personalUrl, currentValue: contact.personalUrl });
      else add("PERSONAL_URL", fields.personalUrl);
    }
    const relationships = (contact.relationships || []).filter(item => item.status === "ACTIVE");
    const sameCompany = relationships.find(item => normalizeName(item.company) === normalizeName(fields.company));
    if (fields.company && !sameCompany) {
      add("RELATIONSHIP", `${fields.role || "Chưa có chức danh"} · ${fields.company}`, {
        company: fields.company, role: fields.role, website: fields.website
      });
    } else if (sameCompany && fields.role && normalizeName(sameCompany.role) !== normalizeName(fields.role)) {
      proposals.push({ id: makeId(), ...base, kind: "UPDATE", target: "RELATIONSHIP", targetId: sameCompany.id,
        value: `${fields.role} · ${sameCompany.company}`, currentValue: `${sameCompany.role || ""} · ${sameCompany.company}`,
        currentMetadata: { company: sameCompany.company, role: sameCompany.role || "", website: sameCompany.website || "" }, metadata: { role: fields.role, website: fields.website } });
    }
    for (const removal of fields.removeTargets || []) {
      if (removal.target === "METHOD") {
        const method = (contact.methods || []).find(item => item.id === removal.targetId && item.status === "ACTIVE");
        if (!method) continue;
        const stillPresent = method.kind === "PHONE"
          ? fields.phone && normalizePhone(fields.phone) === normalizePhone(method.value)
          : fields.email && normalizeEmail(fields.email) === normalizeEmail(method.value);
        if (stillPresent) continue;
        proposals.push({ id: makeId(), ...base, kind: "REMOVE", target: method.kind, targetId: method.id,
          value: method.value, currentValue: method.value });
      }
      if (removal.target === "RELATIONSHIP") {
        const relationship = relationships.find(item => item.id === removal.targetId);
        if (!relationship || (fields.company && normalizeName(fields.company) === normalizeName(relationship.company))) continue;
        proposals.push({ id: makeId(), ...base, kind: "REMOVE", target: "RELATIONSHIP", targetId: relationship.id,
          value: `${relationship.role || "Chưa có chức danh"} · ${relationship.company}`, currentValue: `${relationship.role || ""} · ${relationship.company}` });
      }
    }
    return proposals;
  }

  return { normalizeName, normalizePhone, normalizeEmail, isValidPhone, isValidEmail, safeWebsiteUrl, findDuplicateCandidates, buildAttachProposals };
}));
