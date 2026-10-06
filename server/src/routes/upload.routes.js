const router = require("express").Router();
const { authenticate } = require("../middlewares/auth.middleware");
const database = require("../config/db");
const { blobUploadConfiguration, uploadPolicy, parseUploadPath } = require("../config/blob");
const { handleUpload } = require("@vercel/blob/client");

router.post("/", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const body = req.body;
  if (!body || !["blob.generate-client-token", "blob.upload-completed"].includes(body.type)
    || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)
    || (body.type === "blob.generate-client-token" && typeof body.payload.pathname !== "string")) {
    return res.status(400).json({ message: "Invalid upload request." });
  }
  const generating = body.type === "blob.generate-client-token";
  if (generating && !req.headers.authorization) return res.status(401).json({ message: "กรุณาเข้าสู่ระบบก่อนอัปโหลดไฟล์" });
  if (generating && !parseUploadPath(body.payload.pathname)) return res.status(400).json({ message: "ตำแหน่งไฟล์อัปโหลดไม่ถูกต้อง กรุณาเลือกไฟล์ใหม่" });
  const configuration = await blobUploadConfiguration();
  if (!configuration) {
    return res.status(503).json({ message: "พื้นที่เก็บไฟล์ยังไม่พร้อมใช้งาน กรุณาให้ผู้ดูแลตรวจสอบการเชื่อมต่อ Vercel Blob และตั้งค่าโทเคนกับลิงก์พื้นที่เก็บไฟล์ให้ตรงกัน" });
  }
  req.uploadStorageToken = configuration.token;
  // Legacy completion events are signed by Blob and do not need MongoDB or
  // a user bearer token. The SDK verifies their signature below.
  if (req.body?.type === "blob.upload-completed") return next();
  try {
    if (!await database.connectDB()) return res.status(503).json({ message: "Database is unavailable. Please try again later." });
  } catch {
    return res.status(503).json({ message: "Database is unavailable. Please try again later." });
  }
  return authenticate(req, res, next);
}, (req, res, next) => {
  if (req.body?.type !== "blob.generate-client-token") return next();
  const path = parseUploadPath(req.body.payload.pathname);
  if (path?.[1] !== String(req.user?._id)) return res.status(400).json({ message: "ตำแหน่งไฟล์อัปโหลดไม่ตรงกับบัญชีที่เข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง" });
  if (path[2] === "site" && req.user?.role !== "admin") {
    return res.status(403).json({ message: "เฉพาะผู้ดูแลระบบเท่านั้นที่อัปโหลดรูปเว็บไซต์ได้" });
  }
  next();
}, async (req, res) => {
  try {
    const result = await handleUpload({
      token: req.uploadStorageToken,
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
    if (req.body?.type === "blob.upload-completed") return res.status(400).json({ message: "ข้อมูลยืนยันการอัปโหลดไม่ถูกต้อง" });
    res.status(503).json({ message: "สร้างสิทธิ์อัปโหลดไฟล์ไม่สำเร็จ กรุณาให้ผู้ดูแลตรวจสอบพื้นที่เก็บไฟล์แล้วลองอีกครั้ง" });
  }
});
module.exports = router;
