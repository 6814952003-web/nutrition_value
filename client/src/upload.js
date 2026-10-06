import { put } from "@vercel/blob/client";
import { request } from "./api";
import { readAccessToken } from "./session";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const uploadPolicies = {
  avatar: { types: imageTypes, maxSize: 1_500_000, formats: "PNG, JPG หรือ WebP" },
  site: { types: imageTypes, maxSize: 1_500_000, formats: "PNG, JPG หรือ WebP" },
  post: { types: [...imageTypes, "image/gif", "video/mp4", "video/webm", "video/quicktime"], maxSize: 100_000_000, formats: "PNG, JPG, WebP, GIF, MP4, WebM หรือ MOV" },
};

export function validateUploadFile(file, purpose) {
  const policy = uploadPolicies[purpose];
  if (!policy) throw new Error("ประเภทการอัปโหลดไม่ถูกต้อง");
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("กรุณาเลือกไฟล์ที่มีข้อมูล");
  if (!policy.types.includes(file.type)) throw new Error(`ชนิดไฟล์ไม่รองรับ กรุณาเลือก ${policy.formats}`);
  if (file.size > policy.maxSize) throw new Error(`ไฟล์ต้องมีขนาดไม่เกิน ${policy.maxSize / 1_000_000} MB`);
}

function failure(message, status, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  if (status) error.status = status;
  if (code) error.code = code;
  return error;
}
function uploadError(error) {
  if (error?.code?.startsWith("UPLOAD_")) return error;
  const message = error?.message || "";
  let translated;
  if (error?.status === 401) translated = "การเข้าสู่ระบบหมดอายุ กรุณาเข้าสู่ระบบใหม่แล้วอัปโหลดอีกครั้ง";
  else if (error?.status === 403) translated = /[ก-๙]/.test(message) ? message : "บัญชีนี้ไม่มีสิทธิ์อัปโหลดไฟล์ประเภทนี้";
  else if (error?.status === 503 && /storage|พื้นที่เก็บ/i.test(message)) translated = "ยังไม่ได้ตั้งค่าพื้นที่เก็บรูปภาพ กรุณาให้ผู้ดูแลระบบตั้งค่าพื้นที่อัปโหลดก่อนใช้งาน";
  else if (error?.status === 503) translated = "ระบบอัปโหลดยังไม่พร้อมใช้งาน กรุณาลองอีกครั้งในภายหลัง";
  else if (error?.status === 400 || error?.status === 413) translated = /[ก-๙]/.test(message) ? message : "เซิร์ฟเวอร์ไม่อนุญาตให้อัปโหลดไฟล์นี้ กรุณาตรวจสอบชนิดและขนาดไฟล์แล้วลองอีกครั้ง";
  else if (error instanceof TypeError || /failed to fetch|network|connection|fetch failed|offline/i.test(message)) translated = "เชื่อมต่อระบบอัปโหลดไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";
  else if (/failed to\s+retrieve the client token/i.test(message)) translated = "ขอสิทธิ์อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้งหรือให้ผู้ดูแลตรวจสอบระบบเก็บรูปภาพ";
  else if (/token|unauthorized|access denied|forbidden/i.test(message)) translated = "สิทธิ์อัปโหลดไม่พร้อมใช้งาน กรุณาลองอัปโหลดใหม่อีกครั้ง";
  else translated = /[ก-๙]/.test(message) ? message : "อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง";
  return failure(translated, error?.status, "UPLOAD_FAILED", error);
}
function validPublicBlobUrl(value, userId, purpose) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const prefix = `/uploads/${userId}/${purpose}/`;
    return url.protocol === "https:" && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)
      && !url.username && !url.password && !url.port && !url.search && !url.hash && url.href === value
      && url.pathname.startsWith(prefix) && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(url.pathname.slice(prefix.length));
  } catch { return false; }
}

export async function uploadFile(file, userId, purpose, onUploadProgress) {
  validateUploadFile(file, purpose);
  if (!readAccessToken() || !userId) throw failure("กรุณาเข้าสู่ระบบก่อนอัปโหลดไฟล์", 401, "UPLOAD_LOGIN_REQUIRED");
  if (!/^[a-zA-Z0-9_-]+$/.test(String(userId))) throw failure("ข้อมูลบัญชีไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", 400, "UPLOAD_OWNER_INVALID");

  try {
    const filename = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file";
    const pathname = `uploads/${userId}/${purpose}/${crypto.randomUUID()}-${filename}`;
    const multipart = purpose === "post" && file.size >= 8_000_000;
    // The SDK's upload() wrapper hides HTTP status/body behind a generic token
    // error. Use our API helper so storage errors and expired sessions survive.
    const result = await request("/uploads", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload: null, multipart } }),
    });
    if (result?.type !== "blob.generate-client-token" || typeof result.clientToken !== "string" || !result.clientToken.startsWith("vercel_blob_client_")) {
      throw failure("เซิร์ฟเวอร์ไม่ได้ส่งสิทธิ์อัปโหลดที่ถูกต้อง กรุณาลองอีกครั้ง", undefined, "UPLOAD_TOKEN_INVALID");
    }
    // File bytes go directly to Blob. Only the small token request uses /api.
    const blob = await put(pathname, file, {
      access: "public",
      token: result.clientToken,
      contentType: file.type,
      multipart,
      onUploadProgress,
    });
    if (!validPublicBlobUrl(blob?.url, userId, purpose)) throw failure("ระบบเก็บไฟล์ไม่ได้ส่งลิงก์รูปภาพที่ถูกต้อง กรุณาลองอัปโหลดใหม่", undefined, "UPLOAD_URL_INVALID");
    return blob.url;
  } catch (error) {
    throw uploadError(error);
  }
}
