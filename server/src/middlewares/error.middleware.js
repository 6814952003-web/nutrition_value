const notFound = (req, res, next) => {
    res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
};

const errorHandler = (err, req, res, next) => {
    if (err.type === "entity.too.large") {
        return res.status(413).json({ message: "Request is too large. Upload files directly to Blob and send only their URLs." });
    }
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Request body must be valid JSON." });
    }
    console.error(err.stack);
    if (err.name === "ValidationError") {
        return res.status(400).json({ message: err.message });
    }
    if (err.name === "CastError") {
        return res.status(400).json({ message: `Invalid id: ${err.value}` });
    }
    if (err.code === 11000) {
        return res.status(409).json({ message: "A user with this name or email already exists." });
    }
    res.status(500).json({ message: err.message || "Server error" });
};

module.exports = { notFound, errorHandler };
