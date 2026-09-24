const mongoose = require("mongoose");
let databaseReady = false;
let connectionPromise;

mongoose.set("bufferCommands", false);
mongoose.connection.on("connected", () => { databaseReady = true; });
mongoose.connection.on("disconnected", () => { databaseReady = false; });

const databaseUri = () => {
    if (!process.env.VERCEL && process.env.USE_LOCAL_MONGO === "true") {
        return process.env.LOCAL_MONGO_URI || "mongodb://127.0.0.1:27017/nutrition_value";
    }
    const uri = process.env.MONGO_URI?.trim();
    const directHosts = !process.env.VERCEL && process.env.MONGO_DIRECT_HOSTS;
    if (!uri) throw new Error("MONGO_URI is not configured.");

    // Some Windows/DNS providers reject Node's SRV lookups even though the
    // Atlas hosts themselves are reachable. A normal multi-host URI avoids
    // that SRV lookup while retaining TLS and replica-set discovery.
    if (uri.startsWith("mongodb+srv://") && directHosts) {
        const at = uri.lastIndexOf("@");
        const slash = uri.indexOf("/", at);
        if (at > -1 && slash > at) {
            const base = `mongodb://${uri.slice("mongodb+srv://".length, at + 1)}${directHosts}${uri.slice(slash)}`;
            const separator = base.includes("?") ? "&" : "?";
            return `${base}${separator}${process.env.MONGO_DIRECT_OPTIONS || "tls=true"}`;
        }
    }
    return uri;
};

const connectDB = async () => {
    if (mongoose.connection.readyState === 1) return true;
    if (connectionPromise) return connectionPromise;
    connectionPromise = (async () => {
    try {
        await mongoose.connect(databaseUri(), {
            serverSelectionTimeoutMS: 10000,
            maxPoolSize: 5,
            minPoolSize: 0,
            maxIdleTimeMS: 60000,
        });
        console.log("MongoDB connected");
        databaseReady = true;
        return true;
    } catch (error) {
        databaseReady = false;
        console.error("MongoDB connection failed:", error.name);
        return false;
    }
    })();
    try { return await connectionPromise; }
    finally { connectionPromise = null; }
};
const isDatabaseReady = () => databaseReady;

module.exports = { connectDB, isDatabaseReady };
