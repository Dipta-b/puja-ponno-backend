let app;
let initError = null;

try {
    app = require("../src/index.js");
} catch (err) {
    console.error("❌ Failed to initialize Express app:", err);
    initError = err;
}

module.exports = (req, res) => {
    if (initError || !app) {
        return res.status(500).json({
            message: "Vercel Serverless Function Initialization Error",
            error: initError ? initError.message : "App object not available",
            stack: initError ? initError.stack : null
        });
    }
    return app(req, res);
};
