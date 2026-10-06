const Site = require("../models/site.model");
const { validateSiteConfig, mergeSiteConfig } = require("../config/site");
const SITE_ID = "public-site";
const siteResponse = document => ({
  ...mergeSiteConfig(document?.config),
  revision: document?.revision || 0,
  updatedAt: document?.updatedAt || null,
});

const getSite = async (req, res, next) => {
  try { res.json(siteResponse(await Site.findById(SITE_ID).lean())); }
  catch (error) { next(error); }
};

const conflict = res => res.status(409).json({ message: "มีการแก้ไขเว็บไซต์แล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึกอีกครั้ง" });
const updateSite = async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) return res.status(400).json({ message: "ข้อมูลเว็บไซต์ไม่ถูกต้อง" });
    const { revision, updatedAt, ...config } = body;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER || !validateSiteConfig(config)) {
      return res.status(400).json({ message: "ข้อมูลเว็บไซต์ไม่ถูกต้อง กรุณาตรวจสอบข้อความ ลิงก์ สี และตัวเลข" });
    }
    let document;
    if (revision === 0) {
      try { document = await Site.create({ _id: SITE_ID, config, revision: 1 }); }
      catch (error) { if (error?.code === 11000) return conflict(res); throw error; }
    } else {
      document = await Site.findOneAndUpdate({ _id: SITE_ID, revision }, { $set: { config }, $inc: { revision: 1 } }, { new: true, runValidators: true });
      if (!document) return conflict(res);
    }
    res.json(siteResponse(document));
  } catch (error) { next(error); }
};

module.exports = { getSite, updateSite };
