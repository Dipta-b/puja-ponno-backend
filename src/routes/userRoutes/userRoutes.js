const express = require("express");
const userRoutes = express.Router();

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

const { getCollection } = require("../../config/db");
const verifyToken = require("../../middleware/verifyToken");

// =======================
// REGISTER
// =======================
userRoutes.post("/register", async (req, res) => {
    try {
        const { name, email, password, role, image } = req.body;

        const users = await getCollection("users");

        const existingUser = await users.findOne({ email });

        if (existingUser) {
            return res.status(400).json({
                message: "ইউজার ইতিমধ্যে আছে"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = {
            name,
            email,
            password: hashedPassword,
            role: role || "user",
            requestedRole: role || "user",
            status: "pending",
            image: image || "",
            createdAt: new Date(),
        };

        const result = await users.insertOne(newUser);

        // ⚠️ Never send password back
        res.status(201).json({
            id: result.insertedId,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            image: newUser.image
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            message: "Server error"
        });
    }
});

// =======================
// LOGIN
// =======================
userRoutes.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const users = await getCollection("users");

        const user = await users.findOne({ email });
        if (!user)
            return res.status(404).json({ message: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).json({ message: "Invalid password" });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            image: user.image,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// =======================
// GET CURRENT USER
// =======================
userRoutes.get("/me", async (req, res) => {
    try {
        const token = req.cookies.token;

        if (!token)
            return res.status(401).json({ message: "Not authenticated" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const users = await getCollection("users");

        const user = await users.findOne(
            { _id: new ObjectId(decoded.id) },
            { projection: { password: 0 } }
        );

        if (!user)
            return res.status(404).json({ message: "User not found" });

        res.json(user);
    } catch (err) {
        console.error(err);
        res.status(401).json({ message: "Invalid token" });
    }
});


// ---------------- ME (CURRENT USER) ----------------
userRoutes.get("/me", verifyToken, async (req, res) => {
    try {
        const users = await getCollection("users");

        const user = await users.findOne(
            { _id: new ObjectId(req.user.id) },
            { projection: { password: 0 } }
        );

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// =======================
// LOGOUT
// =======================
userRoutes.post("/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    });

    res.json({ message: "Logged out successfully" });
});

module.exports = userRoutes;