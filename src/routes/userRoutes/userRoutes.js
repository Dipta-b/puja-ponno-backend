const express = require("express");
const userRoutes = express.Router();

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");

const { getCollection } = require("../../config/db");
const verifyToken = require("../../middleware/verifyToken");
const verifyAdmin = require("../../middleware/verifyAdmin");


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

        const userCount = await users.countDocuments();
        const isFirstUser = userCount === 0;

        const hashedPassword = await bcrypt.hash(password, 10);

        const isRequestingAdmin = role === "admin";

        const newUser = {
            name,
            email,
            password: hashedPassword,

            // ROLE SYSTEM
            role: isFirstUser ? "admin" : "user",

            requestedRole: role || "user",

            // IMPORTANT:
            // ❌ status is NOT used for login restriction anymore
            status: isFirstUser ? "approved" : "pending",

            image: image || "",
            createdAt: new Date(),
        };

        const result = await users.insertOne(newUser);

        res.status(201).json({
            id: result.insertedId,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            status: newUser.status,
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
            {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status   // optional info only
            },
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
// CURRENT USER
// =======================
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


// =======================
// GET ALL USERS (ADMIN)
// =======================
userRoutes.get("/users", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const users = await getCollection("users");

        const allUsers = await users.find(
            {},
            { projection: { password: 0 } }
        ).toArray();

        res.json(allUsers);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});


// =======================
// FORCE ADMIN
// =======================
userRoutes.get("/force-admin/:email", async (req, res) => {
    try {
        const users = await getCollection("users");

        const result = await users.updateOne(
            { email: req.params.email },
            { $set: { role: "admin", status: "approved" } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found with this email" });
        }

        res.json({
            message: `Successfully promoted ${req.params.email} to Admin!`
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});


// =======================
// UPDATE ROLE (ADMIN)
// =======================
userRoutes.put("/:id/role", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { role, status } = req.body;
        const users = await getCollection("users");

        const result = await users.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { role, status } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "User updated successfully" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = userRoutes;