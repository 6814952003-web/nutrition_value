const mongoose = require("mongoose");

const trackSchema = new mongoose.Schema(
{
    title: { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },
    durationSec: { type: Number, required: true, min: 1 },
    license: {
        type: String,
        enum: ["original", "cc-by", "public-domain"],
        default: "original",
    },
    downloads: { type: Number, default: 0 },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Track", trackSchema);