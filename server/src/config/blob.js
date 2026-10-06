const blobStorage = require("@vercel/blob");
const { generateClientTokenFromReadWriteToken } = require("@vercel/blob/client");
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MEDIA_TYPES = [...IMAGE_TYPES, "image/gif", "video/mp4", "video/webm", "video/quicktime"];
const PURPOSES = {
  avatar: { types: IMAGE_TYPES, maximumSizeInBytes: 1_500_000 },
  post: { types: MEDIA_TYPES, maximumSizeInBytes: 4_000_000 },
  site: { types: IMAGE_TYPES, maximumSizeInBytes: 1_500_000 },
};

const parseUploadPath = pathname => typeof pathname === "string"
  ? /^uploads\/([a-zA-Z0-9_-]+)\/(avatar|post|site)\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.exec(pathname)
  : null;

const blobPublicOrigin = () => {
  try {
    const url = new URL(process.env.BLOB_PUBLIC_ORIGIN);
    if (url.protocol !== "https:" || !/^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)
      || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
};

const blobUploadConfiguration = async () => {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const origin = blobPublicOrigin();
  if (!origin || typeof token !== "string" || !/^vercel_blob_rw_[a-zA-Z0-9-]+_[a-zA-Z0-9_-]+$/.test(token)) return null;
  try {
    // Ask the installed SDK to resolve/sign its store identity. This probe is
    // never returned, logged or sent to Blob, and no raw secret segments are read.
    const probe = await generateClientTokenFromReadWriteToken({ token, pathname: "configuration-check", validUntil: Date.now() + 1000 });
    const storeHostname = new URL(origin).hostname.split(".")[0];
    if (!probe.toLowerCase().startsWith(`vercel_blob_client_${storeHostname}_`)) return null;
    return { token, origin };
  } catch { return null; }
};

const uploadPolicy = (pathname, userId) => {
  const match = parseUploadPath(pathname);
  if (!match || match[1] !== String(userId)) throw new Error("Invalid upload path.");
  const policy = PURPOSES[match[2]];
  return {
    allowedContentTypes: [...policy.types],
    maximumSizeInBytes: policy.maximumSizeInBytes,
    addRandomSuffix: true,
    allowOverwrite: false,
    validUntil: Date.now() + 5 * 60 * 1000,
  };
};

const validateBlob = async (value, userId, purpose, mediaType) => {
  try {
    if (typeof value !== "string" || !Object.hasOwn(PURPOSES, purpose)) return false;

    const localDataUrl = /^data:(image|video)\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(value);
    const localUnconfigured = process.env.NODE_ENV !== "production" && !process.env.VERCEL
      && !process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_PUBLIC_ORIGIN;
    if (localDataUrl && localUnconfigured) {
      const [, kind, extension, encoded] = localDataUrl;
      const mimeType = `${kind}/${extension.toLowerCase()}`;
      const dataLength = Buffer.from(encoded.replace(/\s+/g, ""), "base64").length;
      const policy = PURPOSES[purpose];
      return policy.types.includes(mimeType)
        && dataLength > 0 && dataLength <= policy.maximumSizeInBytes
        && (!mediaType || kind === mediaType);
    }

    const configuration = await blobUploadConfiguration();
    if (!configuration) return false;
    const url = new URL(value);
    const pathname = url.pathname.slice(1);
    const match = parseUploadPath(pathname);
    if (url.href !== value || url.origin !== configuration.origin || url.username || url.password || url.search || url.hash
      || !match || match[1] !== String(userId) || match[2] !== purpose) return false;

    // Fetch metadata through the authenticated Blob API, never through a URL
    // supplied by the browser. The returned identity must also match the URL.
    const blob = await blobStorage.head(value, { token: configuration.token });
    const policy = PURPOSES[purpose];
    return blob.url === value && blob.pathname === pathname
      && policy.types.includes(blob.contentType)
      && Number.isSafeInteger(blob.size) && blob.size > 0 && blob.size <= policy.maximumSizeInBytes
      && (!mediaType || blob.contentType.startsWith(`${mediaType}/`));
  } catch { return false; }
};
module.exports = { blobPublicOrigin, blobUploadConfiguration, uploadPolicy, validateBlob, parseUploadPath };
