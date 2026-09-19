(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).storage = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const BUCKET = "namecard-images";
  const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
  const cleanId = value => String(value || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  const extension = type => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" }[type] || "bin");

  async function sha256(blob, cryptoImpl = globalThis.crypto) {
    const buffer = await blob.arrayBuffer();
    if (cryptoImpl?.subtle) {
      const digest = await cryptoImpl.subtle.digest("SHA-256", buffer);
      return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    }
    throw new Error("Thiết bị không hỗ trợ SHA-256 an toàn");
  }

  function validateBlob(blob, maxBytes = 15 * 1024 * 1024) {
    if (!(blob instanceof Blob)) throw new Error("Ảnh phải là Blob");
    if (!ALLOWED_TYPES.has(blob.type)) throw new Error("Định dạng ảnh không được hỗ trợ");
    if (!blob.size || blob.size > maxBytes) throw new Error("Kích thước ảnh không hợp lệ");
    return true;
  }

  function storagePath(ownerId, cardId, imageId, checksum, contentType) {
    const owner = cleanId(ownerId), card = cleanId(cardId), image = cleanId(imageId);
    if (!owner || !card || !image || !/^[a-f0-9]{8,64}$/.test(checksum)) throw new Error("Storage path metadata không hợp lệ");
    return `${owner}/${card}/${image}-${checksum.slice(0, 16)}.${extension(contentType)}`;
  }

  class ImageStorage {
    constructor({ client, maxBytes = 15 * 1024 * 1024, bucket = BUCKET }) { this.client = client; this.maxBytes = maxBytes; this.bucket = bucket; }
    async prepare({ ownerId, cardId, imageId, side, blob, lifecycle = "ACTIVE" }) {
      validateBlob(blob, this.maxBytes);
      const checksum = await sha256(blob);
      return { id: imageId, cardId, side, blob, checksum, size: blob.size, contentType: blob.type, path: storagePath(ownerId, cardId, imageId, checksum, blob.type), lifecycle, uploadStatus: "PENDING", version: 1 };
    }
    async upload(ownerId, image, signal) {
      if (image.lifecycle !== "ACTIVE") return { ...image, uploadStatus: "SUPERSEDED", lastError: "LIFECYCLE_NOT_ACTIVE" };
      const expectedPrefix = `${cleanId(ownerId)}/`;
      if (!image.path?.startsWith(expectedPrefix)) throw new Error("Storage path vượt account boundary");
      await this.client.upload(this.bucket, image.path, image.blob, { upsert: true, contentType: image.contentType, signal });
      return { ...image, uploadStatus: "COMPLETE", uploadedAt: new Date().toISOString(), blob: undefined };
    }
    async download(ownerId, path, signal) {
      if (!String(path || "").startsWith(`${cleanId(ownerId)}/`)) throw new Error("Không được tải ảnh ngoài account hiện tại");
      return this.client.download(this.bucket, path, signal);
    }
    async signedUrl(ownerId, path, expiresIn = 300, signal) {
      if (!String(path || "").startsWith(`${cleanId(ownerId)}/`)) throw new Error("Không được ký URL ngoài account hiện tại");
      if (expiresIn > 900) throw new Error("Signed URL vượt thời hạn cho phép");
      return this.client.signUrl(this.bucket, path, expiresIn, signal);
    }
    async remove(ownerId, paths, signal) {
      const prefix = `${cleanId(ownerId)}/`;
      if (!paths.length || paths.some(path => !String(path).startsWith(prefix))) throw new Error("Delete path vượt account boundary");
      return this.client.remove(this.bucket, paths, signal);
    }
  }

  return { BUCKET, ALLOWED_TYPES, sha256, validateBlob, storagePath, ImageStorage };
}));
