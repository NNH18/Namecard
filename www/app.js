const STORAGE_KEY = "memento-p0-data-v1";
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2000;
const logic = window.BCardLogic;
const ocr = window.BCardOCR;

const seed = {
  settings: { online: true, accountId: "acc_demo_01", lastSync: "08:42 hôm nay", activeEventId: "evt_01" },
  events: [
    { id: "evt_01", name: "Vietnam Innovation Summit", date: "06/09/2026", place: "Thiskyhall Sala", contacts: 3 },
    { id: "evt_02", name: "Founder Dinner Saigon", date: "28/08/2026", place: "Quận 1, TP.HCM", contacts: 1 },
    { id: "evt_03", name: "Gặp tại văn phòng", date: "14/08/2026", place: "Thủ Đức", contacts: 1 }
  ],
  contacts: [
    {
      id: "ct_anh", name: "Trần Minh Anh", initials: "TA", color: "peach", draft: false,
      methods: [
        { id: "m_anh_1", kind: "PHONE", label: "Di động", value: "+84 903 456 789", preferred: true, status: "ACTIVE", source: "Card #NC-1001", confirmed: true },
        { id: "m_anh_2", kind: "EMAIL", label: "Công việc", value: "anh.tran@nova.vn", preferred: true, status: "ACTIVE", source: "Card #NC-1001", confirmed: true }
      ],
      personalUrl: "linkedin.com/in/minhanhtran",
      relationships: [
        { id: "rel_1", company: "Nova Solutions", role: "Giám đốc Phát triển", status: "ACTIVE", primary: true, website: "novasolutions.vn", source: "Card #NC-1001" },
        { id: "rel_2", company: "TechBridge Vietnam", role: "Cố vấn", status: "ACTIVE", primary: false, website: "techbridge.vn", source: "Người dùng nhập" }
      ],
      tags: ["Công nghệ", "Đối tác tiềm năng"], event: "Vietnam Innovation Summit",
      notes: [{ id: "n_1", text: "Quan tâm giải pháp số hóa quy trình bán hàng. Hẹn gửi bản demo vào tuần tới.", date: "06/09/2026 · 10:35", sync: "COMPLETE" }],
      cards: ["card_1"], version: 4, sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", lastMet: "2 ngày trước"
    },
    {
      id: "ct_khoa", name: "Lê Quốc Khoa", initials: "LK", color: "blue", draft: false,
      methods: [
        { id: "m_khoa_1", kind: "PHONE", label: "Di động", value: "+84 912 345 810", preferred: true, status: "ACTIVE", source: "Card #NC-1002", confirmed: true },
        { id: "m_khoa_2", kind: "EMAIL", label: "Công việc", value: "khoa.le@horizoncapital.vn", preferred: true, status: "ACTIVE", source: "Card #NC-1002", confirmed: true }
      ],
      personalUrl: "",
      relationships: [{ id: "rel_3", company: "Horizon Capital", role: "Investment Manager", status: "ACTIVE", primary: true, website: "horizoncapital.vn", source: "Card #NC-1002" }],
      tags: ["Đầu tư", "Fintech"], event: "Vietnam Innovation Summit",
      notes: [{ id: "n_2", text: "Đang tìm các startup B2B có doanh thu tại Đông Nam Á.", date: "06/09/2026 · 14:20", sync: "COMPLETE" }],
      cards: ["card_2"], version: 3, sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", lastMet: "2 ngày trước"
    },
    {
      id: "ct_linh", name: "Phạm Gia Linh", initials: "PL", color: "yellow", draft: false,
      methods: [
        { id: "m_linh_1", kind: "PHONE", label: "Văn phòng", value: "+84 28 3822 1588", preferred: true, status: "ACTIVE", source: "Card #NC-1003", confirmed: false },
        { id: "m_linh_2", kind: "EMAIL", label: "Công việc", value: "linh.pham@atelier.co", preferred: true, status: "ACTIVE", source: "Card #NC-1003", confirmed: false }
      ],
      personalUrl: "",
      relationships: [{ id: "rel_4", company: "Atelier & Co.", role: "Creative Director", status: "ACTIVE", primary: true, website: "atelier.co", source: "Card #NC-1003" }],
      tags: ["Thiết kế", "Chưa xác nhận"], event: "Founder Dinner Saigon",
      notes: [], cards: ["card_3"], version: 2, sync: "PENDING", lifecycle: "ACTIVE", incident: "NONE", lastMet: "11 ngày trước"
    },
    {
      id: "ct_nam", name: "Võ Hoàng Nam", initials: "VN", color: "", draft: false,
      methods: [{ id: "m_nam_1", kind: "EMAIL", label: "Công việc", value: "nam.vo@greenlab.vn", preferred: true, status: "ACTIVE", source: "Người dùng nhập", confirmed: true }],
      personalUrl: "",
      relationships: [{ id: "rel_5", company: "GreenLab", role: "Co-founder", status: "ACTIVE", primary: true, website: "greenlab.vn", source: "Card #NC-1004" }],
      tags: ["Môi trường"], event: "Gặp tại văn phòng",
      notes: [{ id: "n_3", text: "Giới thiệu qua chị Hương. Quan tâm hợp tác truyền thông.", date: "14/08/2026 · 16:15", sync: "COMPLETE" }],
      cards: ["card_4"], version: 5, sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", lastMet: "25 ngày trước"
    },
    {
      id: "ct_thu", name: "Đặng Thanh Thu", initials: "ĐT", color: "peach", draft: true,
      methods: [{ id: "m_thu_1", kind: "PHONE", label: "Di động", value: "+84 988 112 233", preferred: true, status: "ACTIVE", source: "Card #NC-1005", confirmed: false }],
      personalUrl: "",
      relationships: [{ id: "rel_6", company: "Mediva", role: "Partnership Lead", status: "ACTIVE", primary: true, website: "mediva.vn", source: "Card #NC-1005" }],
      tags: ["Y tế", "Chưa xác nhận"], event: "Vietnam Innovation Summit",
      notes: [], cards: ["card_5"], version: 1, sync: "RETRY_WAIT", lifecycle: "ACTIVE", incident: "NONE", lastMet: "2 ngày trước"
    }
  ],
  cards: [
    { id: "card_1", code: "NC-1001", contactId: "ct_anh", name: "Trần Minh Anh", company: "Nova Solutions", role: "Giám đốc Phát triển", scanned: "06/09/2026 · 10:32", event: "Vietnam Innovation Summit", acceptance: "LOCAL_ACCEPTED", sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", version: 1, theme: "", front: "", back: "", backBlank: false },
    { id: "card_2", code: "NC-1002", contactId: "ct_khoa", name: "Lê Quốc Khoa", company: "Horizon Capital", role: "Investment Manager", scanned: "06/09/2026 · 14:18", event: "Vietnam Innovation Summit", acceptance: "LOCAL_ACCEPTED", sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", version: 1, theme: "blue-card", front: "", back: "", backBlank: true },
    { id: "card_3", code: "NC-1003", contactId: "ct_linh", name: "Phạm Gia Linh", company: "Atelier & Co.", role: "Creative Director", scanned: "28/08/2026 · 20:45", event: "Founder Dinner Saigon", acceptance: "LOCAL_ACCEPTED", sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", version: 1, theme: "light", front: "", back: "", backBlank: false },
    { id: "card_4", code: "NC-1004", contactId: "ct_nam", name: "Võ Hoàng Nam", company: "GreenLab", role: "Co-founder", scanned: "14/08/2026 · 16:12", event: "Gặp tại văn phòng", acceptance: "LOCAL_ACCEPTED", sync: "COMPLETE", lifecycle: "ACTIVE", incident: "NONE", version: 1, theme: "", front: "", back: "", backBlank: true },
    { id: "card_5", code: "NC-1005", contactId: "ct_thu", name: "Đặng Thanh Thu", company: "Mediva", role: "Partnership Lead", scanned: "06/09/2026 · 16:50", event: "Vietnam Innovation Summit", acceptance: "LOCAL_ACCEPTED", sync: "PARTIAL", lifecycle: "ACTIVE", incident: "NONE", version: 1, theme: "blue-card", front: "", back: "", backBlank: false }
  ],
  proposals: [
    { id: "prop_1", contactId: "ct_anh", kind: "ADD", target: "PHONE", value: "+84 902 222 110", source: "Card #NC-1006", status: "PENDING" }
  ]
};

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function normalizeStoredData(value) {
  const fallback = clone(seed);
  if (!value || typeof value !== "object" || Array.isArray(value)) value = fallback;
  const normalized = {
    settings: { ...fallback.settings, ...(value.settings && typeof value.settings === "object" ? value.settings : {}) },
    events: Array.isArray(value.events) ? value.events : fallback.events,
    contacts: Array.isArray(value.contacts) ? value.contacts : fallback.contacts,
    cards: Array.isArray(value.cards) ? value.cards : fallback.cards,
    proposals: Array.isArray(value.proposals) ? value.proposals : fallback.proposals
  };
  normalized.contacts = normalized.contacts.filter(item => item && typeof item === "object").map(contact => ({
    ...contact,
    methods: Array.isArray(contact.methods) ? contact.methods : [],
    relationships: Array.isArray(contact.relationships) ? contact.relationships : [],
    tags: Array.isArray(contact.tags) ? contact.tags : [],
    notes: Array.isArray(contact.notes) ? contact.notes : [],
    cards: Array.isArray(contact.cards) ? contact.cards : [],
    encounters: Array.isArray(contact.encounters) ? contact.encounters : (contact.event ? [{ id: `enc_migrated_${contact.id}`, event: contact.event, date: contact.lastMet || "Không rõ", source: "MIGRATED", cardId: Array.isArray(contact.cards) ? contact.cards[0] || "" : "" }] : [])
  }));
  normalized.cards = normalized.cards.filter(item => item && typeof item === "object").map(card => {
    const contact = normalized.contacts.find(item => item.id === card.contactId);
    const confirmed = card.reviewStatus === "USER_CONFIRMED" || (!card.reviewStatus && contact && !contact.draft);
    return {
      ...card,
      reviewStatus: confirmed ? "USER_CONFIRMED" : "UNCONFIRMED",
      reviewConfidence: confirmed ? 100 : Number(card.reviewConfidence || 0),
      extractedValues: card.extractedValues && typeof card.extractedValues === "object" ? card.extractedValues : {},
      corrections: Array.isArray(card.corrections) ? card.corrections : []
    };
  });
  normalized.events = normalized.events.filter(item => item && typeof item === "object" && item.name);
  normalized.proposals = normalized.proposals.filter(item => item && typeof item === "object").map(proposal => ({
    ...proposal,
    targetVersion: Number.isFinite(Number(proposal.targetVersion)) ? Number(proposal.targetVersion) : Number(normalized.contacts.find(contact => contact.id === proposal.contactId)?.version || 0),
    createdAt: proposal.createdAt || ""
  }));
  if (!normalized.events.some(event => event.id === normalized.settings.activeEventId)) normalized.settings.activeEventId = normalized.events[0]?.id || "";
  return normalized;
}
function loadData() {
  try { return normalizeStoredData(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return clone(seed); }
}
let data = loadData();
let route = "home";
let selectedContactId = null;
let contactFilter = "Tất cả";
let activeCameraStream = null;
let activeOcrResult = null;
let activeOcrRun = 0;
let modalReturnFocus = null;

const view = document.getElementById("view");
const modalBackdrop = document.getElementById("modalBackdrop");
const frontFile = document.getElementById("frontFile");
const backFile = document.getElementById("backFile");

function saveData() {
  try {
    data.events.forEach(event => { event.contacts = eventContactCount(event.name); });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateChrome();
    return true;
  } catch (error) {
    console.error("BCard could not persist data", error);
    toast("Không thể lưu trên thiết bị", "Dung lượng lưu trữ có thể đã đầy hoặc bị chặn. Thay đổi vừa rồi chưa được áp dụng.");
    return false;
  }
}

function commitMutation(mutator) {
  const snapshot = clone(data);
  try { mutator(); }
  catch (error) {
    data = snapshot;
    console.error("BCard mutation failed", error);
    toast("Không thể áp dụng thay đổi", "Dữ liệu trước thao tác đã được giữ nguyên.");
    return false;
  }
  if (saveData()) return true;
  data = snapshot;
  updateChrome();
  return false;
}

function esc(value = "") {
  return String(value).replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

function icon(name, className = "") {
  return `<i data-lucide="${name}"${className ? ` class="${className}"` : ""} aria-hidden="true"></i>`;
}

function hydrateIcons(scope = document) {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.8 }, nameAttr: "data-lucide", root: scope });
}

function closeIconButton() {
  return `<button class="modal-close pressable" data-close aria-label="Đóng">${icon("x")}</button>`;
}

function primaryRelationship(contact) {
  return contact.relationships.find(item => item.primary && item.status === "ACTIVE") || contact.relationships.find(item => item.status === "ACTIVE") || {};
}

function activeEvent() {
  return data.events.find(event => event.id === data.settings.activeEventId) || data.events[0] || null;
}

function eventContactCount(eventName) {
  return new Set(data.contacts.filter(contact => contact.lifecycle !== "DELETED" && (
    contact.event === eventName || contact.encounters?.some(encounter => encounter.event === eventName)
  )).map(contact => contact.id)).size;
}

function preferredMethod(contact, kind) {
  return contact.methods.find(item => item.kind === kind && item.preferred && item.status === "ACTIVE") || contact.methods.find(item => item.kind === kind && item.status === "ACTIVE");
}

function statusLabel(state) {
  const labels = { COMPLETE: "Đã đồng bộ", PENDING: "Đang chờ", PARTIAL: "Thiếu ảnh", RETRY_WAIT: "Sẽ thử lại", BLOCKED: "Bị chặn", ACTIVE: "Đang dùng", RESTRICTED: "Đang hạn chế", REVOKED: "Đã gỡ", DELETED: "Đã xóa" };
  return labels[state] || state;
}

function statusClass(state) {
  if (["PENDING", "PARTIAL", "RETRY_WAIT"].includes(state)) return "pending";
  if (["RESTRICTED", "BLOCKED", "DELETED"].includes(state)) return "restricted";
  return "";
}

function updateChrome() {
  document.getElementById("navContactCount").textContent = data.contacts.filter(c => c.lifecycle !== "DELETED").length;
  const pending = data.contacts.some(c => c.sync !== "COMPLETE") || data.cards.some(c => c.sync !== "COMPLETE");
  document.getElementById("syncDot").hidden = !pending;
  const pill = document.getElementById("networkPill");
  pill.classList.toggle("offline", !data.settings.online);
  pill.innerHTML = `<span></span>${data.settings.online ? "Dữ liệu trên thiết bị · đang online" : "Đang offline · dữ liệu trên thiết bị"}`;
}

function setRoute(next, options = {}) {
  route = next;
  selectedContactId = options.contactId || null;
  $("[data-route]").removeClass("active").filter(`[data-route="${next}"]`).addClass("active");
  render();
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  view.focus({ preventScroll: true });
}

function pageHead(eyebrow, title, subtitle, action = "") {
  return `<div class="page-head"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subhead">${subtitle}</p></div>${action}</div>`;
}

function contactRow(contact) {
  const rel = primaryRelationship(contact);
  const phone = preferredMethod(contact, "PHONE");
  return `<button class="contact-row" data-contact="${esc(contact.id)}">
    <span class="avatar ${esc(contact.color || "")}">${esc(contact.initials)}</span>
    <span class="contact-main"><strong>${esc(contact.name)}</strong><small>${esc(rel.role || "Chưa có chức danh")}</small></span>
    <span><strong>${esc(rel.company || "Chưa có công ty")}</strong><small>${esc(contact.event)}</small></span>
    <span><strong>${esc(phone?.value || "Chưa có số")}</strong><small>${esc(contact.lastMet)}</small></span>
    <span class="status-pill ${statusClass(contact.sync)}">${contact.draft ? "Chưa xác nhận" : esc(statusLabel(contact.sync))}</span>
    <span class="chevron">${icon("chevron-right")}</span>
  </button>`;
}

function renderHome() {
  const contacts = data.contacts.filter(c => c.lifecycle === "ACTIVE");
  const activeCards = data.cards.filter(card => card.lifecycle === "ACTIVE");
  const pending = allSyncObjects().filter(item => item.sync !== "COMPLETE" && item.lifecycle !== "DELETED").length;
  const draftCount = contacts.filter(contact => contact.draft).length;
  const featured = contacts[0] || { name: "Chưa có contact", relationships: [] };
  const featuredRelationship = primaryRelationship(featured);
  const recentCards = activeCards.slice(0, 2);
  const recentNote = contacts.flatMap(contact => contact.notes.map(note => ({ ...note, contactName: contact.name }))).at(0);
  const activities = [
    ...recentCards.map(card => `<div class="timeline-item"><span class="timeline-icon">${icon(card.sync === "COMPLETE" ? "check" : "clock-3")}</span><div><p><strong>${esc(card.name)}</strong> · ${esc(statusLabel(card.sync))}</p><small>${esc(card.scanned)}</small></div></div>`),
    recentNote ? `<div class="timeline-item"><span class="timeline-icon">${icon("notebook-pen")}</span><div><p>Ghi chú của <strong>${esc(recentNote.contactName)}</strong></p><small>${esc(recentNote.date)}</small></div></div>` : ""
  ].filter(Boolean).slice(0, 3);
  return `<div class="hero grid-item">
    <div class="hero-copy"><p class="eyebrow">Xin chào, Hà</p><h1>Giữ đúng người.<br/>Nhớ đúng chuyện.</h1><p>Lưu namecard, bối cảnh và mọi cách liên hệ trong danh bạ riêng của bạn.</p><div class="hero-actions"><button class="button pressable" data-action="scan">${icon("scan-line")} Quét namecard</button><button class="button secondary pressable" data-route="contacts">Mở danh bạ ${icon("arrow-right")}</button></div></div>
    <div class="hero-card-stage" aria-label="Chồng namecard ba chiều minh họa">
      <div class="floating-card back" aria-hidden="true"></div><div class="floating-card mid" aria-hidden="true"></div>
      <div class="floating-card front"><span class="mini-logo">${esc(featured.initials?.slice(0, 1) || "B")}</span><strong>${esc(featured.name)}</strong><span>${esc(featuredRelationship.role || "Chưa có chức danh")} · ${esc(featuredRelationship.company || "Chưa có công ty")}</span></div>
      <div class="hero-stat"><div><strong>${contacts.length}</strong><small>Trong danh bạ</small></div><div><strong>${activeCards.length}</strong><small>Card đã lưu</small></div><div><strong>${data.events.length}</strong><small>Sự kiện</small></div><div><strong>${pending}</strong><small>Đang chờ</small></div></div>
    </div>
  </div>
  <div class="grid two">
    <section class="panel grid-item"><div class="panel-head"><h2>Gặp gần đây</h2><button class="button ghost small pressable" data-route="contacts">Xem tất cả ${icon("arrow-right")}</button></div><div class="panel-body panel-body-compact">${contacts.slice(0,4).map(contactRow).join("")}</div></section>
    <section class="panel"><div class="panel-head"><h2>Hoạt động</h2><button class="button ghost small" data-route="sync">Đồng bộ</button></div><div class="panel-body"><div class="timeline">${activities.join("") || `<div class="empty">${icon("inbox")}Chưa có hoạt động.</div>`}</div><div class="insight-card"><strong>Gợi ý hôm nay</strong><p>${draftCount ? `Bạn có ${draftCount} hồ sơ chưa xác nhận. Kiểm tra lại tên và thông tin trên ảnh card khi thuận tiện.` : "Tất cả hồ sơ hiện đã được đối chiếu."}</p></div></div></section>
  </div>`;
}

function filteredContacts() {
  const query = (document.getElementById("contactSearch")?.value || "").trim().toLocaleLowerCase("vi");
  return data.contacts.filter(contact => {
    if (contact.lifecycle === "DELETED") return false;
    const rel = primaryRelationship(contact);
    const searchable = searchableContactText(contact);
    const category = contactFilter === "Tất cả" || contact.tags.includes(contactFilter) || (contactFilter === "Chưa xác nhận" && contact.draft);
    return category && searchable.includes(query);
  });
}

function searchableContactText(contact) {
  return [contact.name, contact.event, ...(contact.encounters || []).map(encounter => eventNameOf(encounter)), ...contact.tags,
    ...contact.methods.filter(method => method.status === "ACTIVE").map(method => method.value),
    ...contact.relationships.filter(relationship => relationship.status === "ACTIVE").flatMap(relationship => [relationship.company, relationship.role]),
    ...contact.notes.map(note => note.text)].join(" ").toLocaleLowerCase("vi");
}

function renderContacts() {
  const filters = ["Tất cả", "Công nghệ", "Đầu tư", "Thiết kế", "Chưa xác nhận"];
  return `${pageHead("Danh bạ riêng", "Những người bạn đã gặp", "Tìm theo tên, công ty, số điện thoại, email, tag, sự kiện hoặc ghi chú — kể cả khi không có mạng.", `<button class="button pressable" data-action="scan">${icon("scan-line")} Quét card</button>`)}
    <div class="table-head"><div class="search-wrap">${icon("search")}<label class="sr-only" for="contactSearch">Tìm danh bạ</label><input class="search" id="contactSearch" autocomplete="off" placeholder="Tìm trong dữ liệu trên thiết bị…" /><button class="search-clear pressable" data-action="clear-search" aria-label="Xóa nội dung tìm kiếm">${icon("x")}</button></div><div class="toolbar"><select id="eventFilter" aria-label="Lọc sự kiện"><option>Tất cả sự kiện</option>${data.events.map(e => `<option>${esc(e.name)}</option>`).join("")}</select></div></div>
    <div class="filter-row">${filters.map(filter => `<button class="chip ${filter === contactFilter ? "active" : ""}" data-filter="${filter}">${filter}</button>`).join("")}</div>
    <section class="panel"><div class="panel-body panel-body-compact" id="contactResults">${filteredContacts().map(contactRow).join("")}</div></section>`;
}

function updateContactResults() {
  const target = document.getElementById("contactResults");
  if (!target) return;
  const event = document.getElementById("eventFilter")?.value;
  let results = filteredContacts();
  if (event && event !== "Tất cả sự kiện") results = results.filter(contact => contact.event === event || contact.encounters?.some(encounter => eventNameOf(encounter) === event));
  target.innerHTML = results.length ? results.map(contactRow).join("") : `<div class="empty">${icon("search-x")}Không có kết quả trong dữ liệu trên thiết bị.</div>`;
  hydrateIcons(target);
}

function renderContactDetail(contact) {
  const rel = primaryRelationship(contact);
  const phone = preferredMethod(contact, "PHONE");
  const email = preferredMethod(contact, "EMAIL");
  const visibleMethods = contact.methods.filter(method => method.status === "ACTIVE");
  const visibleRelationships = contact.relationships.filter(relationship => relationship.status === "ACTIVE");
  const proposals = data.proposals.filter(p => p.contactId === contact.id && p.status === "PENDING");
  return `${pageHead("Danh bạ / Hồ sơ", esc(contact.name), "Hồ sơ hiện tại, tách riêng với snapshot trên từng namecard.", `<button class="button secondary pressable" data-route="contacts">${icon("arrow-left")} Danh bạ</button>`)}
  <div class="detail-layout">
    <section class="panel"><div class="panel-body">
      <div class="profile-head"><span class="avatar large ${esc(contact.color || "")}">${esc(contact.initials)}</span><div class="profile-title"><h2>${esc(contact.name)}</h2><p>${esc(rel.role || "Chưa có chức danh")} · ${esc(rel.company || "Chưa có công ty")}</p><div class="tags profile-tags">${contact.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></div><span class="status-pill ${statusClass(contact.sync)}">v${esc(contact.version)} · ${esc(statusLabel(contact.sync))}</span></div>
      <div class="action-row">${phone ? `<button class="button pressable" data-action="call" data-value="${esc(phone.value)}">${icon("phone")} Gọi</button>` : ""}${email ? `<button class="button secondary pressable" data-action="email" data-value="${esc(email.value)}">${icon("mail")} Email</button>` : ""}${rel.website ? `<button class="button secondary pressable" data-action="website" data-value="${esc(rel.website)}">${icon("external-link")} Website công ty</button>` : ""}${contact.personalUrl ? `<button class="button secondary pressable" data-action="website" data-value="${esc(contact.personalUrl)}">${icon("user-round")} Website cá nhân</button>` : ""}<button class="button ghost pressable" data-action="copy-profile" data-id="${esc(contact.id)}">${icon("copy")} Sao chép</button></div>
      <div class="info-section"><h3>Thông tin liên hệ</h3>${visibleMethods.length ? visibleMethods.map(method => `<div class="info-line"><span class="info-icon">${icon(method.kind === "PHONE" ? "phone" : "mail")}</span><div class="info-copy"><strong>${esc(method.value)} ${method.preferred ? '<span class="tag">Ưu tiên</span>' : ""}</strong><small>${esc(method.label)} · ${method.confirmed ? "Đã xác nhận" : "Chưa xác nhận"}</small><div class="source">Nguồn: ${esc(method.source)} · ID ${esc(method.id)}</div></div><button class="button ghost small pressable" data-action="copy" data-value="${esc(method.value)}">${icon("copy")}<span class="sr-only">Sao chép</span></button></div>`).join("") : '<p class="subhead">Chưa có phương thức liên hệ đang hoạt động.</p>'}${contact.personalUrl ? `<div class="info-line"><span class="info-icon">${icon("user-round")}</span><div class="info-copy"><strong>${esc(contact.personalUrl)}</strong><small>Website cá nhân</small><div class="source">Thuộc Contact</div></div><button class="button ghost small pressable" data-action="website" data-value="${esc(contact.personalUrl)}">${icon("external-link")}<span class="sr-only">Mở website cá nhân</span></button></div>` : ""}</div>
      <div class="info-section"><div class="table-head"><h3 class="flush-heading">Bối cảnh & ghi chú</h3><button class="button secondary small pressable" data-action="add-note" data-id="${esc(contact.id)}">${icon("plus")} Ghi chú</button></div><div class="info-line"><span class="info-icon">${icon("calendar-days")}</span><div class="info-copy"><strong>${esc(contact.event)}</strong><small>Lần gặp gần nhất · ${esc(contact.lastMet)}</small></div></div>${contact.notes.length ? contact.notes.map(note => `<div class="note"><p>${esc(note.text)}</p><small>${esc(note.date)} · ${esc(statusLabel(note.sync))}</small></div>`).join("") : '<p class="subhead">Chưa có ghi chú.</p>'}</div>
    </div></section>
    <aside>
      <section class="panel"><div class="panel-head"><h2>Quan hệ công ty</h2></div><div class="panel-body">${visibleRelationships.length ? visibleRelationships.map(r => `<div class="relationship"><span class="company-logo">${esc(r.company.slice(0,2).toUpperCase())}</span><div><strong>${esc(r.company)} ${r.primary ? '<span class="tag">Hiển thị chính</span>' : ""}</strong><p class="relationship-meta">${esc(r.role)} · ${esc(statusLabel(r.status))}</p><small class="source">Website công ty: ${esc(r.website || "—")}<br/>Nguồn: ${esc(r.source)}</small></div></div>`).join("") : '<p class="subhead">Chưa có quan hệ công ty đang hoạt động.</p>'}</div></section>
      ${proposals.length ? `<section class="panel stacked-panel"><div class="panel-head"><h2>Đề xuất cập nhật</h2></div><div class="panel-body">${proposals.map(p => `<div class="proposal"><span class="tag">${esc(p.kind)} ${esc(p.target)}</span><p><strong>${esc(p.value)}</strong><br/>Nguồn: ${esc(p.source)}. Card vẫn giữ snapshot riêng.</p><div class="proposal-actions"><button class="button small" data-action="proposal-approve" data-id="${esc(p.id)}">Chấp nhận</button><button class="button secondary small" data-action="proposal-reject" data-id="${esc(p.id)}">Bỏ qua</button></div></div>`).join("")}</div></section>` : ""}
      <section class="panel stacked-panel"><div class="panel-head"><h2>Namecard gốc</h2></div><div class="panel-body">${contact.cards.map(id => { const c = data.cards.find(card => card.id === id && card.lifecycle !== "DELETED"); return c ? `<button class="business-card full-card" data-card="${esc(c.id)}"><div class="card-visual ${esc(c.theme)}"><strong>${esc(c.name)}</strong><span>${esc(c.role)}</span><small>${esc(c.company)}</small></div><div class="card-meta"><small>${esc(c.code)} · snapshot v${esc(c.version)}</small><span class="status-pill ${statusClass(c.sync)}">${esc(statusLabel(c.sync))}</span></div></button>` : ""; }).join("") || '<p class="subhead">Không còn card đang hoạt động.</p>'}</div></section>
    </aside>
  </div>`;
}

function renderCards() {
  return `${pageHead("Kho ảnh đối chiếu", "Namecard đã tiếp nhận", "Mỗi card là một snapshot lịch sử độc lập; cập nhật hồ sơ hiện tại không sửa nội dung lần quét cũ.", `<button class="button pressable" data-action="scan">${icon("scan-line")} Quét card</button>`)}
  <div class="table-head"><div class="search-wrap">${icon("search")}<label class="sr-only" for="cardSearch">Tìm namecard</label><input class="search" id="cardSearch" placeholder="Tìm theo tên, công ty hoặc sự kiện…" /></div><select id="cardStatus" aria-label="Lọc trạng thái card"><option>Tất cả trạng thái</option><option>COMPLETE</option><option>PENDING</option><option>PARTIAL</option><option>RETRY_WAIT</option><option>BLOCKED</option></select></div>
  <div class="card-grid" id="cardGrid">${data.cards.filter(c => c.lifecycle !== "DELETED").map(cardTile).join("")}</div>`;
}

function cardTile(card) {
  return `<button class="business-card" data-card="${esc(card.id)}" data-search="${esc(`${card.name} ${card.company} ${card.event}`.toLocaleLowerCase("vi"))}" data-sync="${esc(card.sync)}"><div class="card-visual ${esc(card.theme)}">${card.front ? `<img src="${esc(card.front)}" alt="Mặt trước card"/>` : `<strong>${esc(card.name)}</strong><span>${esc(card.role)}</span><small>${esc(card.company)}</small>`}</div><div class="card-meta"><div><strong>${esc(card.name)}</strong><small class="block-text">${esc(card.scanned.split(" · ")[0])}</small></div><span class="status-pill ${statusClass(card.sync)}">${esc(statusLabel(card.sync))}</span></div></button>`;
}

function eventNameOf(encounter) { return typeof encounter === "string" ? encounter : encounter?.event || ""; }

function renderEvents() {
  const selectedEvent = activeEvent();
  return `${pageHead("Bối cảnh gặp gỡ", "Sự kiện", "Gom những người bạn gặp theo nơi và thời điểm để nhớ lại cuộc trò chuyện dễ hơn.", `<button class="button pressable" data-action="add-event">${icon("plus")} Tạo sự kiện</button>`)}
  <div class="card-grid">${data.events.map(event => `<section class="panel grid-item"><div class="panel-body"><span class="company-logo">${icon("calendar-days")}</span><p class="eyebrow event-date">${esc(event.date)}</p><h2>${esc(event.name)}</h2><p class="subhead">${esc(event.place)}</p><div class="event-status-row"><span class="tag">${eventContactCount(event.name)} người đã gặp</span>${selectedEvent?.id === event.id ? '<span class="tag active-event-tag">Đang tự điền khi quét</span>' : ""}</div><div class="table-head event-actions"><button class="button secondary small pressable" data-action="set-active-event" data-id="${esc(event.id)}" ${selectedEvent?.id === event.id ? "disabled" : ""}>${icon("scan-line")} ${selectedEvent?.id === event.id ? "Đang dùng" : "Dùng khi quét"}</button><button class="button ghost small pressable" data-event="${esc(event.name)}">Xem danh bạ ${icon("arrow-right")}</button></div></div></section>`).join("")}</div>`;
}

function allSyncObjects() {
  const objects = [];
  data.cards.forEach(card => objects.push({ id: card.id, type: "Card snapshot", title: `${card.name} · ${card.code}`, version: card.version, sync: card.sync, lifecycle: card.lifecycle, icon: "contact-round" }));
  data.contacts.forEach(contact => objects.push({ id: contact.id, type: "Contact", title: contact.name, version: contact.version, sync: contact.sync, lifecycle: contact.lifecycle, icon: "user-round" }));
  data.contacts.flatMap(c => c.notes.map(n => ({ id: n.id, type: "Note", title: `Ghi chú · ${c.name}`, version: 1, sync: n.sync, lifecycle: "ACTIVE", icon: "notebook-pen" }))).forEach(x => objects.push(x));
  return objects;
}

function renderSync() {
  const objects = allSyncObjects();
  const pending = objects.filter(x => x.sync !== "COMPLETE");
  return `${pageHead("Theo từng object & phiên bản", "Đồng bộ và đối soát", "Acceptance, sync, lifecycle và incident được theo dõi riêng. Card hoàn tất không đại diện cho ghi chú hay hồ sơ liên hệ.", `<button class="button pressable" data-action="sync-now" ${!data.settings.online ? "disabled" : ""}>${icon("refresh-cw")} Đồng bộ ngay</button>`)}
  <div class="sync-summary"><div class="metric"><strong>${data.cards.filter(c => c.acceptance === "LOCAL_ACCEPTED").length}</strong><small>Card LOCAL_ACCEPTED</small></div><div class="metric"><strong>${objects.filter(x => x.sync === "COMPLETE").length}</strong><small>Object COMPLETE</small></div><div class="metric"><strong>${pending.length}</strong><small>Thao tác trong backlog</small></div><div class="metric"><strong>${objects.filter(x => x.lifecycle === "RESTRICTED").length}</strong><small>Đang hạn chế</small></div></div>
  <section class="panel"><div class="panel-head"><div><h2>Backlog thiết bị này</h2><small class="muted-text">Lần đối soát: ${esc(data.settings.lastSync)}</small></div><button class="button secondary small pressable" data-action="toggle-network">${data.settings.online ? "Mô phỏng offline" : "Kết nối lại"}</button></div><div class="panel-body">${objects.map(item => `<div class="sync-item"><span class="sync-type">${icon(item.icon)}</span><div><strong>${esc(item.title)}</strong><small class="block-text muted-text">${esc(item.type)} · ID ${esc(item.id)}</small></div><span>Phiên bản <strong>v${esc(item.version)}</strong></span><span class="status-pill ${statusClass(item.sync)}">${esc(statusLabel(item.sync))}</span></div>`).join("")}</div></section>`;
}

function renderPrivacy() {
  return `${pageHead("Tài khoản của bạn", "Dữ liệu & quyền riêng tư", "Kiểm soát dữ liệu đã lưu, xuất bản sao và gửi yêu cầu liên quan đến thông tin cá nhân.")}
  <div class="grid two"><section class="panel"><div class="panel-head"><h2>Quyền kiểm soát dữ liệu</h2></div><div class="panel-body">
    <div class="privacy-card"><span class="privacy-icon">${icon("download")}</span><div><strong>Xuất dữ liệu tài khoản</strong><p>Tải contacts, phương thức liên hệ, quan hệ công ty, card snapshot, ghi chú và nguồn dữ liệu dưới dạng JSON.</p></div><button class="button secondary small pressable" data-action="export">Xuất dữ liệu</button></div>
    <div class="privacy-card"><span class="privacy-icon">${icon("file-search")}</span><div><strong>Yêu cầu quyền chủ thể dữ liệu</strong><p>Tạo yêu cầu xác minh, xác định source và dữ liệu dẫn xuất cần xem xét.</p></div><button class="button secondary small pressable" data-action="data-request">Tạo yêu cầu</button></div>
    <div class="privacy-card"><span class="privacy-icon">${icon("trash-2")}</span><div><strong>Xóa dữ liệu demo</strong><p>Xóa dữ liệu trong trình duyệt này và khôi phục bộ mẫu ban đầu. Prototype không gửi dữ liệu lên server.</p></div><button class="button danger small pressable" data-action="reset-data">Xóa & đặt lại</button></div>
  </div></section><aside class="panel"><div class="panel-head"><h2>Phạm vi prototype</h2></div><div class="panel-body"><div class="insight-card flush-top"><strong>Dữ liệu giả trên thiết bị</strong><p>Bản này phục vụ discovery và thử trải nghiệm. Không dùng namecard thật trước khi hoàn tất Core P0 Legal & Store Gate trong tài liệu.</p></div><div class="info-section"><h3>Bốn chiều trạng thái</h3><p class="subhead">Acceptance xác nhận app đã tiếp nhận. Sync theo từng object/version. Lifecycle cho biết dữ liệu còn được dùng. Incident ghi sự cố độc lập.</p></div><div class="info-section"><h3>Cách ly tài khoản</h3><p class="subhead">Bộ dữ liệu hiện tại gắn với <strong>${esc(data.settings.accountId)}</strong>. Search và export chỉ đọc phạm vi này.</p></div></div></aside></div>`;
}

function renderAccount() {
  return `${pageHead("Tài khoản", "Nguyễn Hà", "Thiết bị thử nghiệm · dữ liệu lưu trong trình duyệt")}
  <section class="panel account-panel"><div class="panel-body"><div class="profile-head"><span class="avatar large peach">NH</span><div class="profile-title"><h2 class="account-name">Nguyễn Hà</h2><p>ha.nguyen@example.com</p><span class="tag">Prototype P0</span></div></div><div class="info-section"><h3>Thiết bị và phiên</h3><div class="info-line"><span class="info-icon">${icon("smartphone")}</span><div class="info-copy"><strong>Thiết bị hiện tại</strong><small>Đang hoạt động · Optimistic concurrency mô phỏng theo object/version</small></div></div></div><button class="button secondary pressable" data-action="export">${icon("download")} Xuất dữ liệu của tôi</button></div></section>`;
}

function render() {
  if (selectedContactId) {
    const contact = data.contacts.find(c => c.id === selectedContactId);
    view.innerHTML = contact ? renderContactDetail(contact) : renderContacts();
  } else {
    const renderers = { home: renderHome, contacts: renderContacts, cards: renderCards, events: renderEvents, sync: renderSync, privacy: renderPrivacy, account: renderAccount };
    view.innerHTML = (renderers[route] || renderHome)();
  }
  bindViewEvents();
  updateChrome();
  hydrateIcons(view);
  applyStagger();
  bindThreeDimensionalMotion();
}

function bindViewEvents() {
  const $view = $("#view");
  $view.off(".memento");
  $view.on("click.memento", "[data-route]", function () { setRoute(this.dataset.route); });
  $view.on("click.memento", "[data-contact]", function () { setRoute("contacts", { contactId: this.dataset.contact }); });
  $view.on("click.memento", "[data-card]", function () { openCard(this.dataset.card); });
  $view.on("click.memento", "[data-filter]", function () { contactFilter = this.dataset.filter; renderContactsInPlace(); });
  $view.on("click.memento", "[data-action]", handleAction);
  $view.on("click.memento", "[data-event]", function () {
    const eventName = this.dataset.event;
    setRoute("contacts");
    window.setTimeout(() => { $("#eventFilter").val(eventName); updateContactResults(); }, 0);
  });
  $view.on("input.memento", "#contactSearch", updateContactResults);
  $view.on("change.memento", "#eventFilter", updateContactResults);
  $view.on("input.memento", "#cardSearch", filterCards);
  $view.on("change.memento", "#cardStatus", filterCards);
}

function applyStagger() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  $("#view .grid-item, #view .business-card").each(function (index) {
    this.classList.add("grid-item", `stagger-${Math.min(index, 6)}`);
  });
}

function bindThreeDimensionalMotion() {
  if (window.matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
  $(".hero-card-stage, .business-card").off(".tilt")
    .on("pointerenter.tilt pointermove.tilt", function () { this.classList.add("is-tilted"); })
    .on("pointerleave.tilt", function () { this.classList.remove("is-tilted"); });
}

function renderContactsInPlace() {
  view.innerHTML = renderContacts();
  bindViewEvents();
  hydrateIcons(view);
}

function filterCards() {
  const query = (document.getElementById("cardSearch")?.value || "").toLocaleLowerCase("vi");
  const state = document.getElementById("cardStatus")?.value;
  document.querySelectorAll("#cardGrid [data-card]").forEach(card => {
    const matchesQuery = card.dataset.search.includes(query);
    const matchesState = state === "Tất cả trạng thái" || card.dataset.sync === state;
    card.classList.toggle("is-filtered-out", !(matchesQuery && matchesState));
  });
}

function handleAction(event) {
  const button = event.currentTarget;
  const action = button.dataset.action;
  if (action === "scan") openScan();
  if (action === "clear-search") { const input = document.getElementById("contactSearch"); input.value = ""; input.focus(); updateContactResults(); }
  if (action === "call") {
    if (!logic.isValidPhone(button.dataset.value)) return toast("Số điện thoại không hợp lệ", "Hãy kiểm tra lại dữ liệu trước khi gọi.");
    window.location.href = `tel:${button.dataset.value.replace(/[^+\d]/g, "")}`;
    toast("Đã mở màn hình gọi", "Ứng dụng không tự ghi nhận cuộc gọi đã thực hiện.");
  }
  if (action === "email") {
    if (!logic.isValidEmail(button.dataset.value)) return toast("Email không hợp lệ", "Hãy kiểm tra lại dữ liệu trước khi soạn thư.");
    window.location.href = `mailto:${logic.normalizeEmail(button.dataset.value)}`;
    toast("Đã mở email", "Bạn vẫn là người quyết định gửi thư.");
  }
  if (action === "website") {
    const url = logic.safeWebsiteUrl(button.dataset.value);
    if (!url) return toast("Địa chỉ website không hợp lệ", "BCard chỉ mở địa chỉ HTTP hoặc HTTPS.");
    window.open(url, "_blank", "noopener,noreferrer");
  }
  if (action === "copy") copyText(button.dataset.value);
  if (action === "copy-profile") copyProfile(button.dataset.id);
  if (action === "add-note") openNote(button.dataset.id);
  if (action === "proposal-approve" || action === "proposal-reject") resolveProposal(button.dataset.id, action.endsWith("approve"));
  if (action === "sync-now") syncNow();
  if (action === "toggle-network") {
    const nextOnline = !data.settings.online;
    if (commitMutation(() => { data.settings.online = nextOnline; })) {
      render();
      toast(nextOnline ? "Đã kết nối lại" : "Đang mô phỏng offline", "Tìm kiếm và chỉnh sửa vẫn dùng dữ liệu trên thiết bị.");
    }
  }
  if (action === "export") exportData();
  if (action === "data-request") openDataRequest();
  if (action === "reset-data") confirmReset();
  if (action === "add-event") openEventForm();
  if (action === "set-active-event") {
    const selected = data.events.find(item => item.id === button.dataset.id);
    if (selected && commitMutation(() => { data.settings.activeEventId = selected.id; })) {
      render();
      toast("Đã chọn sự kiện", `${selected.name} sẽ được tự điền khi quét card.`);
    }
  }
}

async function copyText(text) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
    await navigator.clipboard.writeText(text);
    toast("Đã sao chép", text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.className = "clipboard-fallback";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand?.("copy");
    input.remove();
    toast(copied ? "Đã sao chép" : "Không thể sao chép tự động", text);
  }
}

function copyProfile(id) {
  const c = data.contacts.find(x => x.id === id);
  const rel = primaryRelationship(c);
  const text = [c.name, `${rel.role || ""} · ${rel.company || ""}`, ...c.methods.filter(method => method.status === "ACTIVE").map(method => `${method.label}: ${method.value}`)].join("\n");
  copyText(text);
}

function showModal(content, wide = false) {
  modalReturnFocus = document.activeElement;
  modalBackdrop.hidden = false;
  modalBackdrop.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${content}</div>`;
  const dialog = modalBackdrop.querySelector?.(".modal");
  const heading = dialog?.querySelector?.("h2");
  if (heading) {
    heading.id = "activeModalTitle";
    dialog.setAttribute("aria-labelledby", heading.id);
  }
  $(modalBackdrop).off("click.modal").on("click.modal", "[data-close]", closeModal);
  hydrateIcons(modalBackdrop);
  window.setTimeout(() => $(modalBackdrop).find("input, textarea, select, button").filter(":visible").first().trigger("focus"), 60);
}
function stopCamera() {
  if (activeCameraStream) activeCameraStream.getTracks().forEach(track => track.stop());
  activeCameraStream = null;
}

function closeModal() {
  stopCamera();
  activeOcrRun += 1;
  activeOcrResult = null;
  modalBackdrop.hidden = true;
  modalBackdrop.innerHTML = "";
  if (modalReturnFocus?.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}

function openScan() {
  showModal(`<div class="modal-head"><div><p class="eyebrow">Bước 1 / 2</p><h2>Chụp hai mặt namecard</h2></div>${closeIconButton()}</div>
    <div class="modal-body"><div class="scan-step"><span class="active"></span><span></span></div><p class="subhead">Ảnh chỉ được báo “đã lưu trên máy” sau khi bạn hoàn tất bước tiếp theo.</p><div class="scan-layout">
      <button class="dropzone pressable" id="frontDrop"><div class="dropzone-content"><span>${icon("camera")}</span><strong>Mặt trước</strong><small>Chụp hoặc chọn ảnh rõ nét</small></div></button>
      <button class="dropzone pressable" id="backDrop"><div class="dropzone-content"><span>${icon("camera")}</span><strong>Mặt sau</strong><small>Chụp ảnh hoặc xác nhận mặt trống</small></div></button>
    </div><div class="camera-actions"><button class="button secondary small pressable" data-camera-target="frontDrop">${icon("camera")} Camera mặt trước</button><button class="button secondary small pressable" data-camera-target="backDrop">${icon("camera")} Camera mặt sau</button></div>
    <section class="camera-panel" id="cameraPanel" hidden><video id="cameraPreview" playsinline muted aria-label="Xem trước camera"></video><canvas id="cameraCanvas" hidden></canvas><div><button class="button pressable" id="cameraCapture">${icon("scan-line")} Chụp ảnh</button><button class="button secondary pressable" id="cameraCancel">Đóng camera</button></div></section>
    <label class="checkbox-row"><input type="checkbox" id="backBlank" /> Mặt sau không có nội dung</label><div class="scan-hint">${icon("sun")}<span>Đặt card trên nền tương phản, tránh lóa và giữ đủ bốn góc. OCR Việt/Anh chạy ngay trên thiết bị và ảnh không được gửi ra dịch vụ ngoài.</span></div></div>
    <div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button><button class="button pressable" id="scanContinue">Tiếp tục kiểm tra ${icon("arrow-right")}</button></div>`, true);
  const frontDrop = document.getElementById("frontDrop");
  const backDrop = document.getElementById("backDrop");
  frontDrop.addEventListener("click", () => frontFile.click());
  backDrop.addEventListener("click", () => backFile.click());
  document.querySelectorAll("[data-camera-target]").forEach(button => button.addEventListener("click", () => startCamera(button.dataset.cameraTarget)));
  document.getElementById("cameraCapture").addEventListener("click", captureCameraFrame);
  document.getElementById("cameraCancel").addEventListener("click", () => {
    stopCamera();
    document.getElementById("cameraPanel").hidden = true;
  });
  document.getElementById("scanContinue").addEventListener("click", () => {
    const front = frontDrop.dataset.image || "";
    const back = backDrop.dataset.image || "";
    const blank = document.getElementById("backBlank").checked;
    if (!front) return toast("Cần ảnh mặt trước", "Chọn một ảnh để tiếp tục.");
    if (!back && !blank) return toast("Cần xử lý mặt sau", "Thêm ảnh hoặc xác nhận mặt sau trống.");
    openOcrReview(front, back, blank);
  });
}

async function startCamera(targetId) {
  if (!navigator.mediaDevices?.getUserMedia) return toast("Camera chưa sẵn sàng", "Bạn vẫn có thể chọn ảnh từ thiết bị.");
  stopCamera();
  try {
    activeCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    const panel = document.getElementById("cameraPanel");
    const video = document.getElementById("cameraPreview");
    if (!panel || !video) return stopCamera();
    panel.dataset.target = targetId;
    panel.hidden = false;
    video.srcObject = activeCameraStream;
    await video.play();
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    stopCamera();
    toast("Không mở được camera", error?.name === "NotAllowedError" ? "Hãy cấp quyền camera hoặc chọn ảnh từ thiết bị." : "Camera đang bận hoặc không được trình duyệt hỗ trợ.");
  }
}

function applyDropzoneImage(targetId, dataUrl) {
  const target = document.getElementById(targetId);
  if (!target) return;
  target.dataset.image = dataUrl;
  target.classList.add("has-image");
  target.querySelector("img")?.remove();
  target.insertAdjacentHTML("afterbegin", `<img src="${esc(dataUrl)}" alt="Ảnh namecard đã chọn" />`);
}

function captureCameraFrame() {
  const panel = document.getElementById("cameraPanel");
  const video = document.getElementById("cameraPreview");
  const canvas = document.getElementById("cameraCanvas");
  if (!panel || !video || !canvas || !video.videoWidth) return toast("Camera chưa có hình", "Chờ một chút rồi chụp lại.");
  const maxWidth = 1600;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  applyDropzoneImage(panel.dataset.target, canvas.toDataURL("image/jpeg", 0.84));
  stopCamera();
  panel.hidden = true;
  toast("Đã chụp ảnh", panel.dataset.target === "frontDrop" ? "Đã thêm mặt trước." : "Đã thêm mặt sau.");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Không đọc được tệp"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function resizeImageDataUrl(dataUrl, mimeType) {
  if (mimeType === "image/svg+xml") return Promise.resolve(dataUrl);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Tệp không phải ảnh hợp lệ"));
    image.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.src = dataUrl;
  });
}

async function fileToDropzone(file, targetId) {
  if (!file) return;
  if (!String(file.type || "").startsWith("image/")) return toast("Tệp không hợp lệ", "Chỉ chọn ảnh namecard.");
  if (file.size > MAX_IMAGE_BYTES) return toast("Ảnh quá lớn", "Chọn ảnh nhỏ hơn 15 MB.");
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const optimized = await resizeImageDataUrl(dataUrl, file.type);
    applyDropzoneImage(targetId, optimized);
  } catch (error) {
    console.error("BCard could not read image", error);
    toast("Không đọc được ảnh", "Hãy chọn lại tệp JPG, PNG, WebP hoặc HEIC được trình duyệt hỗ trợ.");
  }
}

function mountEventCombobox(select, selectedEvent) {
  const values = data.events.map(item => item.name);
  const wrapper = document.createElement("div");
  wrapper.className = "event-combobox";

  const input = document.createElement("input");
  input.id = "ocrEvent";
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = "Nhập hoặc chọn sự kiện";
  input.value = selectedEvent?.name || "";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", "ocrEventListbox");
  input.setAttribute("aria-expanded", "false");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "event-combobox-toggle pressable";
  toggle.setAttribute("aria-label", "Mở danh sách sự kiện");
  toggle.textContent = "⌄";

  const list = document.createElement("div");
  list.id = "ocrEventListbox";
  list.className = "event-combobox-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;

  wrapper.append(input, toggle, list);
  select.replaceWith(wrapper);
  let activeIndex = -1;

  function closeList() {
    list.hidden = true;
    activeIndex = -1;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function choose(value) {
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    closeList();
    input.focus();
  }

  function setActive(index) {
    const options = [...list.querySelectorAll("[role='option']")];
    if (!options.length) return;
    activeIndex = (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      const selected = optionIndex === activeIndex;
      option.classList.toggle("active", selected);
      option.setAttribute("aria-selected", String(selected));
    });
    input.setAttribute("aria-activedescendant", options[activeIndex].id);
    options[activeIndex].scrollIntoView({ block: "nearest" });
  }

  function renderList(showAll = false) {
    const query = input.value.trim();
    const normalized = showAll ? "" : query.toLocaleLowerCase("vi");
    const matches = values.filter(value => !normalized || value.toLocaleLowerCase("vi").includes(normalized));
    const exact = values.some(value => value.toLocaleLowerCase("vi") === normalized);
    const entries = matches.map(value => ({ value, label: value, create: false }));
    if (query && !exact) entries.unshift({ value: query, label: "Tạo sự kiện mới “" + query + "”", create: true });
    list.replaceChildren();
    entries.forEach((entry, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.id = "ocrEventOption" + index;
      option.className = "event-combobox-option" + (entry.create ? " create" : "");
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.dataset.value = entry.value;
      option.textContent = entry.label;
      option.addEventListener("pointerdown", event => event.preventDefault());
      option.addEventListener("click", () => choose(entry.value));
      list.appendChild(option);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  }

  input.addEventListener("click", () => renderList(true));
  input.addEventListener("input", () => renderList(false));
  input.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) renderList(true);
      setActive(activeIndex + (event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Enter" && !list.hidden) {
      const options = [...list.querySelectorAll("[role='option']")];
      if (activeIndex >= 0 && options[activeIndex]) {
        event.preventDefault();
        choose(options[activeIndex].dataset.value);
      } else if (input.value.trim()) {
        closeList();
      }
    } else if (event.key === "Escape") {
      closeList();
    }
  });
  toggle.addEventListener("click", () => {
    if (list.hidden) {
      input.focus();
      renderList(true);
    } else {
      closeList();
    }
  });
  wrapper.addEventListener("focusout", event => {
    if (!event.relatedTarget || !wrapper.contains(event.relatedTarget)) closeList();
  });
  wrapper.closest(".modal")?.addEventListener("pointerdown", event => {
    if (!wrapper.contains(event.target)) closeList();
  });
}

function openOcrReview(front, back, backBlank) {
  activeOcrResult = null;
  const runId = ++activeOcrRun;
  const selectedEvent = activeEvent();
  showModal(`<div class="modal-head"><div><p class="eyebrow">Bước 2 / 2 · OCR Việt/Anh</p><h2>Kiểm tra thông tin</h2></div>${closeIconButton()}</div>
    <div class="modal-body"><div class="scan-step"><span class="done"></span><span class="active"></span></div><div class="form-grid">
      <div class="field"><label for="ocrName">Họ và tên *</label><input id="ocrName" autocomplete="name" placeholder="Kiểm tra họ tên" /></div><div class="field"><label for="ocrRole">Chức danh</label><input id="ocrRole" autocomplete="organization-title" placeholder="Chức danh trên card" /></div>
      <div class="field"><label for="ocrCompany">Công ty</label><input id="ocrCompany" autocomplete="organization" placeholder="Tên công ty" /></div><div class="field"><label for="ocrEvent">Sự kiện</label><select id="ocrEvent">${data.events.map(e => `<option value="${esc(e.name)}"${selectedEvent?.id === e.id ? " selected" : ""}>${esc(e.name)}</option>`).join("")}<option>Không có sự kiện</option></select><small class="field-hint">${selectedEvent ? `Tự điền từ sự kiện đang dùng: ${esc(selectedEvent.name)}` : "Chưa có sự kiện đang dùng."}</small></div>
      <div class="field"><label for="ocrPhone">Số điện thoại</label><input id="ocrPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Số điện thoại" /></div><div class="field"><label for="ocrEmail">Email</label><input id="ocrEmail" type="email" inputmode="email" autocomplete="email" placeholder="Email" /></div>
      <div class="field wide"><label for="ocrWebsite">Website công ty</label><input id="ocrWebsite" type="url" inputmode="url" placeholder="tencongty.vn" /></div><div class="field wide"><label for="ocrNote">Ghi chú bối cảnh</label><textarea id="ocrNote" placeholder="Bạn đã nói chuyện về điều gì?"></textarea></div>
    </div><section class="ocr-status" id="ocrStatus" role="status" aria-live="polite"><div><span class="ocr-spinner" aria-hidden="true"></span><strong id="ocrStatusText">Đang khởi tạo OCR trên thiết bị…</strong><span id="ocrPercent">Tiến trình 0%</span></div><progress id="ocrProgress" max="100" value="0">0%</progress><small>Trong lúc chờ, bạn có thể nhập hoặc sửa trường. BCard không ghi đè nội dung bạn đã sửa.</small></section><label class="review-confirm"><input type="checkbox" id="ocrConfirmed"/><span><strong>Tôi đã đối chiếu thông tin với ảnh card</strong><small>Có thể lưu để kiểm tra sau. Chỉ đánh dấu khi bạn đã đối chiếu ảnh; dữ liệu sẽ được xác nhận 100%.</small></span></label><div class="scan-hint">${icon("badge-info")}<span>Nếu chưa chắc, hãy lưu ở trạng thái chưa xác nhận và kiểm tra lại sau. Khi gặp trùng, BCard đề nghị liên kết nhưng không tự ghi đè hồ sơ.</span></div></div>
    <div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button><button class="button pressable" id="saveScan">${icon("save")} Lưu trên máy</button></div>`, true);
  mountEventCombobox(document.getElementById("ocrEvent"), selectedEvent);
  document.querySelectorAll("#ocrName, #ocrRole, #ocrCompany, #ocrPhone, #ocrEmail, #ocrWebsite").forEach(input => input.addEventListener("input", () => { input.dataset.userEdited = "true"; }));
  document.getElementById("ocrConfirmed").addEventListener("change", event => {
    const status = document.getElementById("ocrStatus");
    const statusText = document.getElementById("ocrStatusText");
    status.classList.toggle("verified", event.target.checked);
    if (event.target.checked) statusText.textContent = "Đã xác nhận · độ tin cậy 100%";
    else if (activeOcrResult) statusText.textContent = `OCR hoàn tất · chất lượng nhận dạng ${activeOcrResult.confidence}%`;
  });
  document.getElementById("saveScan").addEventListener("click", () => commitScan({ front, back, backBlank }, activeOcrResult));
  runOcrReview({ front, back: backBlank ? "" : back }, runId);
}

function fillOcrField(id, value) {
  const input = document.getElementById(id);
  if (input && !input.dataset.userEdited && value) input.value = value;
}

async function runOcrReview(images, runId) {
  const status = document.getElementById("ocrStatus");
  const statusText = document.getElementById("ocrStatusText");
  const progress = document.getElementById("ocrProgress");
  const percent = document.getElementById("ocrPercent");
  try {
    const result = await ocr.recognize(images, update => {
      if (runId !== activeOcrRun || !progress) return;
      const value = Math.max(0, Math.min(100, Math.round(update.progress * 100)));
      progress.value = value;
      progress.textContent = `${value}%`;
      percent.textContent = `Tiến trình ${value}%`;
      statusText.textContent = update.status;
    });
    if (runId !== activeOcrRun || !document.getElementById("ocrName")) return;
    activeOcrResult = result;
    fillOcrField("ocrName", result.name);
    fillOcrField("ocrRole", result.role);
    fillOcrField("ocrCompany", result.company);
    fillOcrField("ocrPhone", result.phone);
    fillOcrField("ocrEmail", result.email);
    fillOcrField("ocrWebsite", result.website);
    status.classList.add("complete");
    progress.value = 100;
    percent.textContent = "Tiến trình 100%";
    statusText.textContent = document.getElementById("ocrConfirmed")?.checked ? "Đã xác nhận · độ tin cậy 100%" : `OCR hoàn tất · chất lượng nhận dạng ${result.confidence}%`;
  } catch (error) {
    if (runId !== activeOcrRun || !status) return;
    status.classList.add("error");
    statusText.textContent = "Không đọc được tự động — hãy nhập thủ công";
    percent.textContent = "";
    toast("OCR chưa hoàn tất", "Ảnh vẫn ở trên thiết bị; bạn có thể nhập thông tin và lưu bình thường.");
  }
}

function readScanFields() {
  return {
    name: document.getElementById("ocrName").value.trim(),
    role: document.getElementById("ocrRole").value.trim(),
    company: document.getElementById("ocrCompany").value.trim(),
    eventName: document.getElementById("ocrEvent").value.trim() || "Không có sự kiện",
    phone: document.getElementById("ocrPhone").value.trim(),
    email: document.getElementById("ocrEmail").value.trim(),
    website: document.getElementById("ocrWebsite").value.trim(),
    note: document.getElementById("ocrNote").value.trim(),
    personalUrl: "",
    userConfirmed: Boolean(document.getElementById("ocrConfirmed")?.checked)
  };
}

function validateScanFields(fields) {
  const checks = [
    ["ocrName", Boolean(fields.name), "Thiếu họ tên", "Hãy kiểm tra trường bắt buộc."],
    ["ocrPhone", logic.isValidPhone(fields.phone), "Số điện thoại không hợp lệ", "Dùng từ 8 đến 15 chữ số; có thể kèm dấu +, khoảng trắng hoặc dấu gạch."],
    ["ocrEmail", logic.isValidEmail(fields.email), "Email không hợp lệ", "Hãy kiểm tra phần trước và sau ký tự @."],
    ["ocrWebsite", !fields.website || Boolean(logic.safeWebsiteUrl(fields.website)), "Website không hợp lệ", "BCard chỉ chấp nhận địa chỉ HTTP hoặc HTTPS."]
  ];
  document.querySelectorAll("#ocrName, #ocrPhone, #ocrEmail, #ocrWebsite, #ocrConfirmed").forEach(input => input.removeAttribute("aria-invalid"));
  const invalid = checks.find(([, valid]) => !valid);
  if (!invalid) return true;
  const input = document.getElementById(invalid[0]);
  input?.setAttribute("aria-invalid", "true");
  input?.focus();
  toast(invalid[2], invalid[3]);
  return false;
}

function commitScan(images, ocrResult = null) {
  const fields = readScanFields();
  if (!validateScanFields(fields)) return;
  const duplicate = logic.findDuplicateCandidates(data.contacts, fields)[0];
  if (duplicate) return openDuplicateReview(images, fields, duplicate, ocrResult);
  persistScan(images, fields, "", ocrResult);
}

function openDuplicateReview(images, fields, duplicate, ocrResult = null) {
  const contact = duplicate.contact;
  const relationship = primaryRelationship(contact);
  const phone = preferredMethod(contact, "PHONE")?.value || "Chưa có số điện thoại";
  const email = preferredMethod(contact, "EMAIL")?.value || "Chưa có email";
  const removableMethods = contact.methods.filter(method => method.status === "ACTIVE" && (
    (method.kind === "PHONE" && logic.normalizePhone(method.value) !== logic.normalizePhone(fields.phone)) ||
    (method.kind === "EMAIL" && logic.normalizeEmail(method.value) !== logic.normalizeEmail(fields.email))
  ));
  const removableRelationships = contact.relationships.filter(item => item.status === "ACTIVE" && logic.normalizeName(item.company) !== logic.normalizeName(fields.company));
  const removalOptions = [
    ...removableMethods.map(method => ({ target: "METHOD", id: method.id, label: `${method.kind === "PHONE" ? "Số điện thoại" : "Email"}: ${method.value}` })),
    ...removableRelationships.map(item => ({ target: "RELATIONSHIP", id: item.id, label: `Quan hệ: ${item.role || "Chưa có chức danh"} · ${item.company}` }))
  ];
  showModal(`<div class="modal-head"><div><p class="eyebrow">Phát hiện hồ sơ có thể trùng</p><h2>Liên kết hay tạo mới?</h2></div>${closeIconButton()}</div>
    <div class="modal-body"><p class="subhead">BCard tìm thấy <strong>${esc(duplicate.reasons.join(", "))}</strong>. Card mới luôn được giữ thành snapshot riêng và không tự ghi đè hồ sơ.</p>
      <div class="duplicate-compare"><div class="insight-card"><strong>Hồ sơ hiện có: ${esc(contact.name)}</strong><p>${esc(relationship.role || "Chưa có chức danh")} · ${esc(relationship.company || "Chưa có công ty")}<br>${esc(phone)}<br>${esc(email)}</p></div>
      <div class="insight-card"><strong>Dữ liệu vừa quét: ${esc(fields.name)}</strong><p>${esc(fields.role || "Chưa có chức danh")} · ${esc(fields.company || "Chưa có công ty")}<br>${esc(fields.phone || "Chưa có số điện thoại")}<br>${esc(fields.email || "Chưa có email")}</p></div></div>
      <div class="scan-hint">${icon("git-compare-arrows")}<span>Nếu liên kết, dữ liệu khác sẽ trở thành đề xuất PENDING để bạn duyệt trong hồ sơ.</span></div>
      ${removalOptions.length ? `<fieldset class="removal-options"><legend>Dữ liệu cũ không còn trên card mới</legend><p>Chỉ chọn mục bạn muốn tạo đề xuất gỡ. BCard chưa thay đổi hồ sơ ở bước này.</p>${removalOptions.map(option => `<label class="removal-option"><input type="checkbox" name="removeTarget" data-target="${esc(option.target)}" data-target-id="${esc(option.id)}"/> <span>${esc(option.label)}</span></label>`).join("")}</fieldset>` : ""}</div>
    <div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button><button class="button secondary pressable" id="createSeparate">Tạo người mới</button><button class="button pressable" id="attachExisting">${icon("link")} Liên kết hồ sơ</button></div>`, true);
  document.getElementById("createSeparate").addEventListener("click", () => persistScan(images, fields, "", ocrResult));
  document.getElementById("attachExisting").addEventListener("click", () => {
    const removeTargets = [...document.querySelectorAll('input[name="removeTarget"]:checked')].map(input => ({ target: input.dataset.target, targetId: input.dataset.targetId }));
    persistScan(images, { ...fields, removeTargets }, contact.id, ocrResult);
  });
}

function ocrCorrections(fields, ocrResult) {
  if (!ocrResult) return [];
  return ["name", "role", "company", "phone", "email", "website"]
    .filter(key => String(fields[key] || "").trim() !== String(ocrResult[key] || "").trim())
    .map(key => ({ field: key, original: ocrResult[key] || "", corrected: fields[key] || "", source: "USER_CONFIRMATION" }));
}

function persistScan(images, fields, attachContactId = "", ocrResult = null) {
  const now = new Date();
  const stamp = now.getTime();
  const id = `ct_${stamp}`;
  const cardId = `card_${stamp}`;
  const code = `NC-${1000 + data.cards.length + 1}`;
  const source = `Card #${code}`;
  const initials = fields.name.split(/\s+/).slice(-2).map(x => x[0]).join("").toUpperCase();
  const methods = [];
  if (fields.phone) methods.push({ id: `m_${stamp}_p`, kind: "PHONE", label: "Di động", value: fields.phone, preferred: true, status: "ACTIVE", source, confirmed: fields.userConfirmed });
  if (fields.email) methods.push({ id: `m_${stamp}_e`, kind: "EMAIL", label: "Công việc", value: fields.email, preferred: true, status: "ACTIVE", source, confirmed: fields.userConfirmed });
  let proposalCount = 0;
  const saved = commitMutation(() => {
    let scanEvent = data.events.find(item => item.name.toLocaleLowerCase("vi") === fields.eventName.toLocaleLowerCase("vi"));
    if (!scanEvent && fields.eventName !== "Không có sự kiện") {
      scanEvent = {
        id: "evt_" + stamp,
        name: fields.eventName,
        date: now.toLocaleDateString("vi-VN"),
        place: "Chưa có địa điểm",
        contacts: 0
      };
      data.events.unshift(scanEvent);
      data.settings.activeEventId = scanEvent.id;
    }
    if (attachContactId) {
      const contact = data.contacts.find(item => item.id === attachContactId);
      if (!contact) throw new Error("Contact no longer exists");
      const proposals = logic.buildAttachProposals(contact, fields, source, () => `prop_${stamp}_${++proposalCount}`);
      data.proposals.unshift(...proposals);
      contact.cards.unshift(cardId);
      contact.encounters ||= [];
      contact.encounters.unshift({ id: `enc_${stamp}`, event: fields.eventName, date: now.toISOString(), source, cardId });
      contact.event = fields.eventName;
      if (fields.note) contact.notes.unshift({ id: `n_${stamp}`, text: fields.note, date: "Vừa xong", sync: "PENDING", source });
      contact.version += 1;
      proposals.forEach(proposal => { proposal.targetVersion = contact.version; });
      contact.sync = "PENDING";
      contact.lastMet = "Vừa xong";
    } else {
      data.contacts.unshift({ id, name: fields.name, nameSource: source, initials, color: "peach", draft: !fields.userConfirmed, methods, personalUrl: "", relationships: fields.company ? [{ id: `rel_${stamp}`, company: fields.company, role: fields.role, status: "ACTIVE", primary: true, website: fields.website, source }] : [], tags: fields.userConfirmed ? [] : ["Chưa xác nhận"], event: fields.eventName, encounters: [{ id: `enc_${stamp}`, event: fields.eventName, date: now.toISOString(), source, cardId }], notes: fields.note ? [{ id: `n_${stamp}`, text: fields.note, date: "Vừa xong", sync: "PENDING", source }] : [], cards: [cardId], version: 1, sync: "PENDING", lifecycle: "ACTIVE", incident: "NONE", lastMet: "Vừa xong" });
    }
    data.cards.unshift({
      id: cardId, code, contactId: attachContactId || id, name: fields.name, company: fields.company, role: fields.role,
      scanned: "Vừa xong", event: fields.eventName, acceptance: "LOCAL_ACCEPTED", sync: "PENDING", lifecycle: "ACTIVE", incident: "NONE", version: 1, theme: "",
      front: images.front, back: images.back, backBlank: images.backBlank,
      rawOcr: ocrResult?.rawText || "", ocrConfidence: Number(ocrResult?.confidence || 0), ocrLanguage: ocrResult?.language || "manual",
      reviewStatus: fields.userConfirmed ? "USER_CONFIRMED" : "UNCONFIRMED", reviewConfidence: fields.userConfirmed ? 100 : 0, confirmedAt: fields.userConfirmed ? now.toISOString() : "",
      extractedValues: ocrResult ? { name: ocrResult.name, role: ocrResult.role, company: ocrResult.company, phone: ocrResult.phone, email: ocrResult.email, website: ocrResult.website } : {},
      corrections: ocrCorrections(fields, ocrResult)
    });
    if (scanEvent) scanEvent.contacts = eventContactCount(scanEvent.name);
  });
  if (!saved) return;
  closeModal();
  setRoute("contacts", { contactId: attachContactId || id });
  toast("Đã lưu bền trên thiết bị", attachContactId ? `Card đã liên kết; có ${proposalCount} đề xuất cần duyệt.` : "Card đạt LOCAL_ACCEPTED và đã vào hàng đợi đồng bộ.");
}

function openNote(contactId) {
  showModal(`<div class="modal-head"><h2>Thêm ghi chú</h2>${closeIconButton()}</div><div class="modal-body"><div class="field"><label for="noteText">Bối cảnh cuộc gặp</label><textarea id="noteText" autofocus placeholder="Điểm cần nhớ, nhu cầu hoặc lời hẹn…"></textarea></div></div><div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button><button class="button pressable" id="saveNote">${icon("save")} Lưu ghi chú</button></div>`);
  document.getElementById("saveNote").addEventListener("click", () => {
    const text = document.getElementById("noteText").value.trim(); if (!text) return;
    const saved = commitMutation(() => {
      const contact = data.contacts.find(c => c.id === contactId);
      if (!contact) throw new Error("Contact no longer exists");
      contact.notes.unshift({ id: `n_${Date.now()}`, text, date: "Vừa xong", sync: "PENDING" });
      contact.version += 1;
      contact.sync = "PENDING";
    });
    if (!saved) return;
    closeModal(); render(); toast("Đã lưu ghi chú", "Contact và note có trạng thái đồng bộ độc lập.");
  });
}

function openCard(id) {
  const card = data.cards.find(c => c.id === id); if (!card) return;
  const verification = card.reviewStatus === "USER_CONFIRMED" ? `Đã xác nhận ${esc(card.reviewConfidence)}% · ` : "";
  const ocrEvidence = card.rawOcr ? `<details class="ocr-evidence"><summary>${verification}OCR ${esc(card.ocrLanguage || "vie+eng")} · chất lượng ${esc(card.ocrConfidence || 0)}%</summary><p>Giá trị OCR gốc được giữ riêng với dữ liệu đã xác nhận. Có ${esc(card.corrections?.length || 0)} chỉnh sửa của người dùng.</p><pre>${esc(card.rawOcr)}</pre></details>` : `<p class="source ocr-evidence-empty">Card này chưa có dữ liệu OCR gốc.</p>`;
  showModal(`<div class="modal-head"><div><p class="eyebrow">Snapshot lịch sử · v${esc(card.version)}</p><h2>${esc(card.code)}</h2></div>${closeIconButton()}</div><div class="modal-body"><div class="scan-layout"><div class="card-visual card-visual-detail ${esc(card.theme)}">${card.front ? `<img src="${esc(card.front)}" alt="Mặt trước"/>` : `<strong>${esc(card.name)}</strong><span>${esc(card.role)}</span><small>${esc(card.company)}</small>`}</div><div class="card-visual card-visual-detail light">${card.back ? `<img src="${esc(card.back)}" alt="Mặt sau"/>` : `<strong>${card.backBlank ? "Mặt sau đã xác nhận trống" : "Ảnh mặt sau mẫu"}</strong><span>${esc(card.event)}</span><small>${esc(card.scanned)}</small>`}</div></div><div class="sync-summary sync-summary-modal"><div class="metric"><strong class="metric-state">${esc(card.acceptance)}</strong><small>Acceptance</small></div><div class="metric"><strong class="metric-state">${esc(card.sync)}</strong><small>Sync card v${esc(card.version)}</small></div><div class="metric"><strong class="metric-state">${esc(card.lifecycle)}</strong><small>Lifecycle</small></div><div class="metric"><strong class="metric-state">${esc(card.incident)}</strong><small>Incident</small></div></div>${ocrEvidence}</div><div class="modal-footer"><button class="button danger pressable" id="deleteCard">${icon("trash-2")} Xóa card</button><button class="button secondary pressable" id="relinkCard">${icon("link")} Sửa liên kết</button>${card.reviewStatus !== "USER_CONFIRMED" ? `<button class="button pressable" id="confirmCardReview">${icon("badge-check")} Xác nhận đã đối chiếu</button>` : ""}<button class="button secondary pressable" data-close>Đóng</button></div>`, true);
  document.getElementById("deleteCard").addEventListener("click", () => deleteCard(id));
  document.getElementById("relinkCard").addEventListener("click", () => openRelinkCard(id));
  document.getElementById("confirmCardReview")?.addEventListener("click", () => confirmCardReview(id));
}

function confirmCardReview(id) {
  const saved = commitMutation(() => {
    const card = data.cards.find(item => item.id === id && item.lifecycle === "ACTIVE");
    if (!card) throw new Error("Card no longer exists");
    card.reviewStatus = "USER_CONFIRMED";
    card.reviewConfidence = 100;
    card.confirmedAt = new Date().toISOString();
    card.version += 1;
    card.sync = "PENDING";
    const contact = data.contacts.find(item => item.id === card.contactId);
    if (contact) {
      const source = `Card #${card.code}`;
      contact.methods.filter(method => method.source === source && method.status === "ACTIVE").forEach(method => { method.confirmed = true; });
      contact.draft = false;
      contact.tags = contact.tags.filter(tag => tag !== "Chưa xác nhận");
      contact.version += 1;
      contact.sync = "PENDING";
    }
  });
  if (!saved) return;
  const card = data.cards.find(item => item.id === id);
  closeModal();
  setRoute("contacts", { contactId: card?.contactId });
  toast("Đã xác nhận thông tin", "Card được đánh dấu đã đối chiếu 100%; điểm OCR gốc vẫn được giữ riêng.");
}

function openRelinkCard(id) {
  const card = data.cards.find(item => item.id === id);
  if (!card) return;
  const choices = data.contacts.filter(contact => contact.lifecycle === "ACTIVE" && contact.id !== card.contactId);
  showModal(`<div class="modal-head"><div><p class="eyebrow">${esc(card.code)}</p><h2>Sửa liên kết contact</h2></div>${closeIconButton()}</div><div class="modal-body"><p class="subhead">Chọn đúng người cho snapshot này. Dữ liệu trong card và hồ sơ không bị trộn.</p><div class="relink-list">${choices.map(contact => `<button class="contact-row relink-choice" data-relink-contact="${esc(contact.id)}"><span class="avatar ${esc(contact.color || "")}">${esc(contact.initials)}</span><span class="contact-main"><strong>${esc(contact.name)}</strong><small>${esc(primaryRelationship(contact).company || "Chưa có công ty")}</small></span><span class="chevron">${icon("chevron-right")}</span></button>`).join("") || '<p class="subhead">Không có contact khác để liên kết.</p>'}</div></div><div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button></div>`);
  document.querySelectorAll("[data-relink-contact]").forEach(button => button.addEventListener("click", () => relinkCard(id, button.dataset.relinkContact)));
}

function relinkCard(cardId, contactId) {
  const saved = commitMutation(() => {
    const card = data.cards.find(item => item.id === cardId);
    const target = data.contacts.find(item => item.id === contactId && item.lifecycle === "ACTIVE");
    if (!card || !target) throw new Error("Card or contact no longer exists");
    const previousContactId = card.contactId;
    const previous = data.contacts.find(contact => contact.id === previousContactId);
    data.contacts.forEach(contact => { contact.cards = contact.cards.filter(id => id !== cardId); });
    if (!target.cards.includes(cardId)) target.cards.unshift(cardId);
    card.previousContactId = previousContactId;
    card.contactId = target.id;
    card.relinkedAt = new Date().toISOString();
    card.version += 1;
    card.sync = "PENDING";
    if (previous) {
      previous.encounters = (previous.encounters || []).filter(encounter => encounter.cardId !== cardId && encounter.source !== `Card #${card.code}`);
      if (previous.event === card.event && previous.encounters[0]) {
        previous.event = eventNameOf(previous.encounters[0]);
        previous.lastMet = previous.encounters[0].date || previous.lastMet;
      } else if (previous.event === card.event && !previous.encounters.length) {
        previous.event = "Không có sự kiện";
        previous.lastMet = "Chưa có lần gặp khác";
      }
    }
    target.encounters ||= [];
    if (!target.encounters.some(encounter => encounter.cardId === cardId)) target.encounters.unshift({ id: `enc_relink_${Date.now()}`, event: card.event, date: card.scanned, source: `Card #${card.code}`, cardId });
    target.event = card.event;
    target.lastMet = card.scanned;
    target.version += 1;
    target.sync = "PENDING";
    if (previous && previous.id !== target.id) {
      previous.version += 1;
      previous.sync = "PENDING";
    }
  });
  if (!saved) return;
  closeModal();
  setRoute("contacts", { contactId });
  toast("Đã sửa liên kết", "Snapshot card đã chuyển đúng contact và không ghi đè trường dữ liệu.");
}

function deleteCard(id) {
  const saved = commitMutation(() => {
    const card = data.cards.find(c => c.id === id); if (!card) throw new Error("Card no longer exists");
    card.lifecycle = "DELETED";
    card.sync = "PENDING";
    card.purgedEvidenceSummary = { hadFront: Boolean(card.front), hadBack: Boolean(card.back), hadRawOcr: Boolean(card.rawOcr), correctionCount: card.corrections?.length || 0 };
    card.front = "";
    card.back = "";
    card.rawOcr = "";
    card.extractedValues = {};
    card.corrections = [];
    card.contentPurgedAt = new Date().toISOString();
  });
  if (!saved) return;
  closeModal(); render();
  toast("Card đã chuyển sang DELETED", "Ảnh và nội dung OCR cục bộ đã được xóa; lịch sử acceptance không bị đổi.");
}

function proposalIsApplicable(contact, proposal) {
  if (contact.lifecycle !== "ACTIVE") return false;
  if (proposal.kind === "UPDATE" && proposal.target === "NAME") return !proposal.currentValue || contact.name === proposal.currentValue;
  if (["UPDATE", "REMOVE"].includes(proposal.kind) && proposal.target === "PERSONAL_URL") return !proposal.currentValue || contact.personalUrl === proposal.currentValue;
  if (proposal.kind === "ADD" && proposal.target === "PHONE") return !contact.methods.some(method => method.status === "ACTIVE" && method.kind === "PHONE" && logic.normalizePhone(method.value) === logic.normalizePhone(proposal.value));
  if (proposal.kind === "ADD" && proposal.target === "EMAIL") return !contact.methods.some(method => method.status === "ACTIVE" && method.kind === "EMAIL" && logic.normalizeEmail(method.value) === logic.normalizeEmail(proposal.value));
  if (["UPDATE", "REMOVE"].includes(proposal.kind) && ["PHONE", "EMAIL"].includes(proposal.target)) {
    const method = contact.methods.find(item => item.id === proposal.targetId);
    return Boolean(method && method.status === "ACTIVE" && (!proposal.currentValue || method.value === proposal.currentValue));
  }
  if (["UPDATE", "REMOVE"].includes(proposal.kind) && proposal.target === "RELATIONSHIP") {
    const relationship = contact.relationships.find(item => item.id === proposal.targetId);
    const currentValue = relationship ? `${relationship.role || ""} · ${relationship.company}` : "";
    const metadataMatches = !proposal.currentMetadata || (relationship.company === proposal.currentMetadata.company && relationship.role === proposal.currentMetadata.role && (relationship.website || "") === (proposal.currentMetadata.website || ""));
    return Boolean(relationship && relationship.status === "ACTIVE" && (!proposal.currentValue || currentValue === proposal.currentValue) && metadataMatches);
  }
  return true;
}

function resolveProposal(id, approve) {
  const proposal = data.proposals.find(p => p.id === id); if (!proposal) return;
  let superseded = false;
  const saved = commitMutation(() => {
    const contact = data.contacts.find(c => c.id === proposal.contactId);
    if (!contact) throw new Error("Contact no longer exists");
    if (approve && !proposalIsApplicable(contact, proposal)) {
      proposal.status = "SUPERSEDED";
      proposal.reason = "Target đã thay đổi hoặc không còn hoạt động";
      superseded = true;
    } else {
      proposal.status = approve ? "ACCEPTED" : "REJECTED";
      if (approve) applyApprovedProposal(contact, proposal);
      if (approve) {
        contact.version += 1;
        data.proposals.filter(item => item.contactId === contact.id && item.status === "PENDING").forEach(item => { item.targetVersion = contact.version; });
      }
    }
    proposal.decidedAt = new Date().toISOString();
    proposal.decidedBy = data.settings.accountId;
    contact.sync = "PENDING";
  });
  if (!saved) return;
  render();
  if (superseded) toast("Đề xuất không còn áp dụng", "Target đã thay đổi; BCard không ghi đè dữ liệu mới hơn.");
  else toast(approve ? "Đã chấp nhận đề xuất" : "Đã bỏ qua đề xuất", "Snapshot card nguồn vẫn được giữ riêng.");
}

function applyApprovedProposal(contact, proposal) {
  if (proposal.kind === "ADD" && ["PHONE", "EMAIL"].includes(proposal.target)) {
    contact.methods.push({ id: `m_${Date.now()}`, kind: proposal.target, label: proposal.metadata?.label || "Khác", value: proposal.value, preferred: false, status: "ACTIVE", source: proposal.source, confirmed: true });
  }
  if (proposal.kind === "ADD" && proposal.target === "PERSONAL_URL") contact.personalUrl = proposal.value;
  if (proposal.kind === "ADD" && proposal.target === "RELATIONSHIP") {
    contact.relationships.push({ id: `rel_${Date.now()}`, company: proposal.metadata?.company || proposal.value, role: proposal.metadata?.role || "", website: proposal.metadata?.website || "", status: "ACTIVE", primary: false, source: proposal.source });
  }
  if (["UPDATE", "REMOVE"].includes(proposal.kind) && ["PHONE", "EMAIL"].includes(proposal.target)) {
    const method = contact.methods.find(item => item.id === proposal.targetId);
    if (!method) throw new Error("Proposal target no longer exists");
    if (proposal.kind === "UPDATE") { method.value = proposal.value; method.source = proposal.source; method.confirmed = true; }
    else { method.status = "REVOKED"; method.source = proposal.source; }
  }
  if (["UPDATE", "REMOVE"].includes(proposal.kind) && proposal.target === "RELATIONSHIP") {
    const relationship = contact.relationships.find(item => item.id === proposal.targetId);
    if (!relationship) throw new Error("Proposal target no longer exists");
    if (proposal.kind === "UPDATE") {
      relationship.role = proposal.metadata?.role ?? relationship.role;
      relationship.website = proposal.metadata?.website ?? relationship.website;
      relationship.source = proposal.source;
    } else { relationship.status = "REVOKED"; relationship.source = proposal.source; }
  }
  if (proposal.kind === "UPDATE" && proposal.target === "NAME") {
    contact.name = proposal.value;
    contact.nameSource = proposal.source;
    contact.initials = proposal.value.split(/\s+/).slice(-2).map(part => part[0]).join("").toUpperCase();
  }
  if (proposal.kind === "UPDATE" && proposal.target === "PERSONAL_URL") contact.personalUrl = proposal.value;
  if (proposal.kind === "REMOVE" && proposal.target === "PERSONAL_URL") contact.personalUrl = "";
}

function syncNow() {
  if (!data.settings.online) return toast("Không có kết nối", "Các thay đổi vẫn được giữ trên thiết bị.");
  toast("Đang đối soát", "Kiểm tra từng object và phiên bản…");
  $(".status-pill.pending").text("Đang tải…");
  setTimeout(() => {
    const saved = commitMutation(() => {
      data.contacts.forEach(c => { if (c.lifecycle === "ACTIVE") c.sync = "COMPLETE"; c.notes.forEach(n => n.sync = "COMPLETE"); });
      data.cards.forEach(c => { if (["ACTIVE", "DELETED"].includes(c.lifecycle)) c.sync = "COMPLETE"; });
      data.settings.lastSync = "Vừa xong";
    });
    render();
    if (saved) toast("Đồng bộ hoàn tất", "ACK đã khớp từng object/version trong dữ liệu mô phỏng.");
  }, 900);
}

function exportData() {
  const payload = { exportedAt: new Date().toISOString(), accountId: data.settings.accountId, contacts: data.contacts, cards: data.cards, events: data.events, updateProposals: data.proposals };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "bcard-data-export.json"; link.click(); URL.revokeObjectURL(link.href);
  toast("Đã xuất dữ liệu", "Tệp JSON bao gồm nguồn và trạng thái từng bản ghi.");
}

function openDataRequest() {
  showModal(`<div class="modal-head"><h2>Yêu cầu quyền dữ liệu</h2>${closeIconButton()}</div><div class="modal-body"><div class="form-grid"><div class="field"><label for="requestType">Loại yêu cầu</label><select id="requestType"><option>Truy cập dữ liệu</option><option>Chỉnh sửa dữ liệu</option><option>Hạn chế xử lý</option><option>Xóa dữ liệu</option></select></div><div class="field"><label for="requestEmail">Email xác minh</label><input id="requestEmail" type="email" autocomplete="email" value="ha.nguyen@example.com" /></div><div class="field wide"><label for="requestScope">Phạm vi / mô tả</label><textarea id="requestScope" placeholder="Mô tả người, card hoặc dữ liệu liên quan…"></textarea></div></div><div class="scan-hint">${icon("shield-check")}<span>Quy trình thật cần xác minh, xác định source và derived fields/relationships, review, hành động, audit và phản hồi.</span></div></div><div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button><button class="button pressable" id="submitRequest">${icon("file-check-2")} Ghi nhận yêu cầu demo</button></div>`);
  document.getElementById("submitRequest").addEventListener("click", () => { closeModal(); toast("Đã ghi nhận yêu cầu demo", "Mã yêu cầu DSR-2026-0001 · chưa gửi ra hệ thống ngoài."); });
}

function confirmReset() {
  showModal(`<div class="modal-head"><h2>Xóa dữ liệu demo?</h2>${closeIconButton()}</div><div class="modal-body"><p>Thao tác này xóa các thay đổi trong localStorage rồi nạp lại dữ liệu mẫu ban đầu.</p></div><div class="modal-footer"><button class="button secondary pressable" data-close>Giữ lại</button><button class="button danger pressable" id="confirmReset">${icon("trash-2")} Xóa & đặt lại</button></div>`);
  document.getElementById("confirmReset").addEventListener("click", () => { if (!commitMutation(() => { data = clone(seed); })) return; closeModal(); setRoute("home"); toast("Đã đặt lại dữ liệu", "Bộ dữ liệu mẫu đã được khôi phục."); });
}

function openEventForm() {
  const today = new Date().toISOString().slice(0, 10);
  showModal(`<div class="modal-head"><h2>Tạo sự kiện</h2>${closeIconButton()}</div><div class="modal-body"><div class="form-grid"><div class="field wide"><label for="eventName">Tên sự kiện</label><input id="eventName" placeholder="Ví dụ: Founder Meetup" /></div><div class="field"><label for="eventDate">Ngày</label><input id="eventDate" type="date" value="${today}" /></div><div class="field"><label for="eventPlace">Địa điểm</label><input id="eventPlace" autocomplete="street-address" placeholder="TP.HCM" /></div></div><div class="scan-hint">${icon("scan-line")}<span>Sự kiện mới sẽ tự trở thành sự kiện đang dùng và được điền sẵn ở lần quét tiếp theo.</span></div></div><div class="modal-footer"><button class="button secondary pressable" data-close>Hủy</button><button class="button pressable" id="saveEvent">${icon("calendar-plus")} Tạo sự kiện</button></div>`);
  document.getElementById("saveEvent").addEventListener("click", () => {
    const name = document.getElementById("eventName").value.trim();
    if (!name) return;
    const existing = data.events.find(event => event.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"));
    if (existing) {
      if (!commitMutation(() => { data.settings.activeEventId = existing.id; })) return;
      closeModal();
      render();
      return toast("Đã chọn sự kiện hiện có", `${existing.name} sẽ được tự điền khi quét card.`);
    }
    const eventId = `evt_${Date.now()}`;
    const saved = commitMutation(() => {
      data.events.unshift({ id: eventId, name, date: document.getElementById("eventDate").value || "Chưa đặt ngày", place: document.getElementById("eventPlace").value || "Chưa có địa điểm", contacts: 0 });
      data.settings.activeEventId = eventId;
    });
    if (!saved) return;
    closeModal();
    render();
    toast("Đã tạo và chọn sự kiện", `${name} sẽ được tự điền khi quét card.`);
  });
}

function toast(title, detail = "") {
  const region = document.getElementById("toastRegion");
  const node = document.createElement("div"); node.className = "toast"; node.innerHTML = `<strong>${esc(title)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}`; region.appendChild(node); setTimeout(() => node.remove(), 3600);
}

function applyTheme(theme) {
  const dark = theme === "dark";
  $("body").toggleClass("theme-dark", dark);
  $("#themeButton").attr("aria-pressed", String(dark)).html(icon(dark ? "sun" : "moon"));
  $("meta[name='theme-color']").attr("content", dark ? "#0c1220" : "#f3f6ff");
  try { localStorage.setItem("memento-theme", theme); }
  catch (error) { console.warn("BCard could not persist theme", error); }
  hydrateIcons(document.getElementById("themeButton"));
}

function handleModalKeydown(event) {
  if (modalBackdrop.hidden) return;
  if (event.key === "Escape") return closeModal();
  if (event.key !== "Tab") return;
  const focusable = [...modalBackdrop.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")].filter(element => !element.hidden && element.getClientRects().length);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

$(function () {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let storedTheme = "";
  try { storedTheme = localStorage.getItem("memento-theme") || ""; }
  catch (error) { console.warn("BCard could not read theme", error); }
  applyTheme(storedTheme || (systemDark ? "dark" : "light"));
  if (typeof navigator.onLine === "boolean") data.settings.online = navigator.onLine;
  const platform = window.Capacitor?.getPlatform?.() || "web";
  $("body").addClass(`platform-${platform}`);

  $(document).on("click.shell", ".sidebar [data-route], .topbar [data-route], .bottom-nav [data-route]", function () { setRoute(this.dataset.route); });
  $("#mobileScan").on("click.shell", openScan);
  $("#notificationButton").on("click.shell", () => {
    const pending = allSyncObjects().filter(item => item.sync !== "COMPLETE").length;
    const drafts = data.contacts.filter(contact => contact.lifecycle === "ACTIVE" && contact.draft).length;
    toast(pending || drafts ? "Có việc cần kiểm tra" : "Mọi thứ đang ổn", `${pending} thay đổi cần đồng bộ · ${drafts} hồ sơ chưa xác nhận.`);
  });
  $("#themeButton").on("click.shell", () => applyTheme($("body").hasClass("theme-dark") ? "light" : "dark"));
  $(modalBackdrop).on("click.shell", event => { if (event.target === modalBackdrop) closeModal(); });
  $(frontFile).on("change.shell", () => { fileToDropzone(frontFile.files[0], "frontDrop"); frontFile.value = ""; });
  $(backFile).on("change.shell", () => { fileToDropzone(backFile.files[0], "backDrop"); backFile.value = ""; });
  $(document).on("keydown.shell", handleModalKeydown);
  $(window).on("offline.shell", () => { if (commitMutation(() => { data.settings.online = false; })) toast("Đã chuyển sang offline", "Tìm kiếm vẫn hoạt động trên dữ liệu thiết bị."); });
  $(window).on("online.shell", () => { if (commitMutation(() => { data.settings.online = true; })) toast("Đã có kết nối", "Bạn có thể đối soát các thay đổi đang chờ."); });

  updateChrome();
  render();
  hydrateIcons(document);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
});
