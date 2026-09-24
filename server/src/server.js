require("dotenv").config();

const app = require("./app");
const { connectDB } = require("./config/db");

const PORT = process.env.PORT || 5000;
const start = async () => {
    app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
    const connect = async () => {
        if (await connectDB()) return;
        const retrySeconds = Number(process.env.MONGO_RETRY_SECONDS || 5);
        console.log(`Retrying MongoDB connection in ${retrySeconds} seconds...`);
        setTimeout(connect, retrySeconds * 1000);
    };
    connect();
};

start();
