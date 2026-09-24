const router = require("express").Router();
const { authenticate } = require("../middlewares/auth.middleware");
const database = require("../config/db");
const { blobPublicOrigin, uploadPolicy } = require("../config/blob");
const { handleUpload } = require("@vercel/blob/client");

router.post("/", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const body = req.body;
  if (!body || !["blob.generate-client-token", "blob.upload-completed"].includes(body.type)
    || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)
    || (body.type === "blob.generate-client-token" && typeof body.payload.pathname !== "string")) {
    return res.status(400).json({ message: "Invalid upload request." });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN || !blobPublicOrigin()) {
    return res.status(503).json({ message: "File storage is not configured." });
  }
  // Legacy completion events are signed by Blob and do not need MongoDB or
  // a user bearer token. The SDK verifies their signature below.
  if (req.body?.type === "blob.upload-completed") return next();
  if (!req.headers.authorization) return res.status(401).json({ message: "Authentication is required." });
  try {
    if (!await database.connectDB()) return res.status(503).json({ message: "Database is unavailable. Please try again later." });
  } catch {
    return res.status(503).json({ message: "Database is unavailable. Please try again later." });
  }
  return authenticate(req, res, next);
}, async (req, res) => {
  try {
    const result = await handleUpload({
      request: req,
      body: req.body,
      onBeforeGenerateToken: async pathname => {
        if (!req.user) throw new Error("Authentication is required.");
        return uploadPolicy(pathname, req.user._id);
      },
      // No callback is needed: the client saves the URL with its post/profile,
      // and the controller verifies its Blob metadata before saving it.
    });
    res.json(result);
  } catch {
    res.status(400).json({ message: "Unable to authorize this upload. Check the file and sign in again." });
  }
});
module.exports = router;
