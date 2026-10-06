const express = require("express");
const cors = require("cors");
const trackRoutes = require("./routes/track.routes");
const userRoutes = require("./routes/user.routes");
const postRoutes = require("./routes/post.routes");
const { connectDB } = require("./config/db");
const { notFound, errorHandler } = require("./middlewares/error.middleware");
const app = express();

// 1. Global middleware
app.use(cors());
// Privacy responses stay uncached even when JSON parsing or the shared database
// preflight fails before their router is reached.
app.use((req, res, next) => {
  if (/^\/api\/(?:profiles|users)(?:\/|$)/.test(req.path)) res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json({ limit: "256kb" }));

// 2. Routes
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
// Blob verifies completion signatures without requiring an Atlas connection.
// Requests for new upload tokens connect to Atlas inside the upload route.
app.use("/api/uploads", require("./routes/upload.routes"));
// Site settings must always be read fresh, including temporary service errors.
app.use("/api/site", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api/catalog", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api/profiles", (req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use("/api", async (req, res, next) => {
  if (!await connectDB()) return res.status(503).json({ message: "Database is unavailable. Please try again in a moment." });
  next();
});
app.use("/api/tracks", trackRoutes);
app.use("/api/users", userRoutes);
app.use("/api/profiles", require("./routes/profile.routes"));
app.use("/api/posts", postRoutes);
app.use("/api/site", require("./routes/site.routes"));
app.use("/api/catalog", require("./routes/catalog.routes"));

// 3. Error handling — must be LAST
app.use(notFound);
app.use(errorHandler);

module.exports = app;
