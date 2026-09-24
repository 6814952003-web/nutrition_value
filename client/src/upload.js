import { upload } from "@vercel/blob/client";

const imageTypes = ["image/png", "image/jpeg", "image/webp"];
const uploadPolicies = {
  avatar: { types: imageTypes, maxSize: 1_500_000, formats: "PNG, JPG, or WebP" },
  post: { types: [...imageTypes, "image/gif", "video/mp4", "video/webm", "video/quicktime"], maxSize: 4_000_000, formats: "PNG, JPG, WebP, GIF, MP4, WebM, or MOV" },
};

export function validateUploadFile(file, purpose) {
  const policy = uploadPolicies[purpose];
  if (!policy) throw new Error("Invalid upload purpose.");
  if (!file || !file.size) throw new Error("Choose a non-empty file to upload.");
  if (!policy.types.includes(file.type)) throw new Error(`Unsupported file type. Choose ${policy.formats}.`);
  if (file.size > policy.maxSize) throw new Error(`File must be ${policy.maxSize / 1_000_000} MB or smaller.`);
}

export async function uploadFile(file, userId, purpose, onUploadProgress) {
  validateUploadFile(file, purpose);
  const token = localStorage.getItem("nouri-token");
  if (!token || !userId) throw new Error("Please sign in before uploading.");
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "file";
  // Only token negotiation uses our API. The SDK sends file bytes directly to Blob.
  const blob = await upload(`uploads/${userId}/${purpose}/${crypto.randomUUID()}-${filename}`, file, {
    access: "public",
    handleUploadUrl: "/api/uploads",
    headers: { Authorization: `Bearer ${token}` },
    contentType: file.type,
    onUploadProgress,
  });
  return blob.url;
}
