require("dotenv").config(); // 👈 MUST BE FIRST

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const userRoutes = require("./routes/userRoutes/userRoutes");
const { connectDB } = require("./config/db");
const productRoutes = require("./routes/productRoutes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes/categoryRoutes");
const commentRoutes = require("./routes/commentRoutes/commentRoutes");
const cartRoutes = require("./routes/cartRoutes/cartRoutes");
const { paymentRoute } = require("./routes/paymentRoutes/paymentRoutes");
const orderRoutes = require("./routes/orderRoutes");
const adminAnalyticsRoutes = require("./routes/adminRoutes");

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "https://puja-ponno-frontend.vercel.app",
    process.env.CLIENT_URL,
    process.env.BASE_URL_FRONTEND,
].filter(Boolean);

app.use(cookieParser());
app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            if (
                allowedOrigins.includes(origin) ||
                origin.endsWith(".vercel.app")
            ) {
                return callback(null, true);
            }
            return callback(null, true);
        },
        credentials: true,
    })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root healthcheck endpoint - returns 200 OK immediately
app.get("/", (req, res) => {
    res.send("Puja Ponno Backend is Running!");
});

// Ensure DB is initialized before database API route handlers execute
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        console.error("❌ MongoDB connection error:", err.message);
        res.status(500).json({ 
            message: "Database connection failed. Please check DB_URI in Vercel Environment Variables.", 
            error: err.message 
        });
    }
});

app.use("/api/auth", userRoutes);
app.use("/products", productRoutes);
app.use("/categories", categoryRoutes);
app.use("/comments", commentRoutes);
app.use("/cart", cartRoutes);
app.use("/payment", paymentRoute);
app.use("/orders", orderRoutes);
app.use("/admin/analytics", adminAnalyticsRoutes);

if (process.env.NODE_ENV !== "production") {
    app.listen(port, () => {
        console.log(`✅ Server running on port ${port}`);
    });
}

module.exports = app;