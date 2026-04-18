const express = require("express");
const categoryRoutes = express.Router();
const { ObjectId } = require("mongodb");

const verifyToken = require("../../middleware/verifyToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const { getCollection } = require("../../config/db");

// GET all categories
categoryRoutes.get("/", async (req, res) => {
    try {
        const collection = await getCollection("categories");
        const data = await collection.find().sort({ createdAt: -1 }).toArray();
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// CREATE category (admin only)
categoryRoutes.post("/", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { name, nameBn } = req.body;

        const collection = await getCollection("categories");

        const category = {
            name,
            nameBn,
            slug: name.toLowerCase().replace(/\s+/g, "-"),
            createdAt: new Date(),
        };

        const result = await collection.insertOne(category);
        res.status(201).json(result);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE category
categoryRoutes.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const collection = await getCollection("categories");

        const result = await collection.deleteOne({
            _id: new ObjectId(req.params.id),
        });

        res.json(result);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = categoryRoutes;