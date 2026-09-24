// Vercel owns the HTTP listener; database connections are reused by warm instances.
module.exports = require("../server/src/app");
