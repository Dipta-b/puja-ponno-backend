require("dotenv").config(); // 👈 MUST BE FIRST

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const userRoutes = require("./routes/userRoutes/userRoutes");

const { connectDB } = require("./config/db");
const productRoutes = require("./routes/productRoutes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes/categoryRoutes");

const app = express();
const port = process.env.PORT || 3000;

app.use(cookieParser());
app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use(express.json());

app.use("/api/auth", userRoutes);
app.use("/products", productRoutes);
app.use("/categories", categoryRoutes);

app.get("/", (req, res) => {
    res.send("Puja Ponno Backend is Running!");
});

connectDB()
    .then(() => {
        console.log("✅ MongoDB ready for requests");

        app.listen(port, () => {
            console.log(`✅ Server running on port ${port}`);
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err);
    });