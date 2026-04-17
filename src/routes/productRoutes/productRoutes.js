const express = require("express");
const productRoutes = express.Router();
const { ObjectId } = require("mongodb");

const verifyToken = require("../../middleware/verifyToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const { getCollection } = require("../../config/db");

// GET all products
productRoutes.get("/", async (req, res) => {
    try {
        const collection = await getCollection("products");

        const products = await collection
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        res.json(products);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// GET by category slug
productRoutes.get("/category/:slug", async (req, res) => {
    try {
        const collection = await getCollection("products");

        const data = await collection
            .find({ categorySlug: req.params.slug })
            .toArray();

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// GET featured
productRoutes.get("/featured", async (req, res) => {
    const collection = await getCollection("products");

    const data = await collection
        .find({ isFeatured: true })
        .toArray();

    res.json(data);
});

// GET best seller
productRoutes.get("/bestseller", async (req, res) => {
    const collection = await getCollection("products");

    const data = await collection
        .find({ isBestSeller: true })
        .toArray();

    res.json(data);
});

// GET single product
productRoutes.get("/:id", async (req, res) => {
    const collection = await getCollection("products");

    const product = await collection.findOne({
        _id: new ObjectId(req.params.id),
    });

    res.json(product);
});

// CREATE product (ADMIN)
productRoutes.post("/", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const collection = await getCollection("products");

        const {
            name,
            category,
            price,
            thumbnail,

            // ✅ PACKAGE SUPPORT (NEW - OPTIONAL)
            duration,     // number of days (10/20/30)
            discount,     // discount amount
            items         // package items list
        } = req.body;

        // 🔴 VALIDATION (EXISTING)
        if (!name || !category || !price || !thumbnail) {
            return res.status(400).json({
                message: "Missing required fields (name, category, price, thumbnail)"
            });
        }

        // 🔥 Existing itemsIncluded (OLD SYSTEM)
        const itemsIncluded = Array.isArray(req.body.itemsIncluded)
            ? req.body.itemsIncluded.filter(
                i => i.name?.trim() && i.quantity?.trim()
            )
            : [];

        // 🔥 NEW: Clean package items
        const packageItems = Array.isArray(items)
            ? items.filter(
                i => i.name?.trim() && i.quantity?.trim()
            )
            : [];

        const product = {
            ...req.body,

            // ✅ KEEP OLD SYSTEM
            itemsIncluded,

            // ✅ NEW PACKAGE FIELDS
            duration: duration || null,   // days
            discount: discount || 0,      // default 0
            items: packageItems,          // package items

            createdAt: new Date(),
        };

        const result = await collection.insertOne(product);

        res.status(201).json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// UPDATE (ADMIN)
productRoutes.put("/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const collection = await getCollection("products");

        // ✅ This allows updating EVERYTHING:
        // - duration (days)
        // - price
        // - discount
        // - items
        // - any new future field
        const updateData = { ...req.body };
        delete updateData._id;

        const result = await collection.updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateData }
        );

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// DELETE (ADMIN)
productRoutes.delete("/:id", verifyToken, verifyAdmin, async (req, res) => {
    const collection = await getCollection("products");

    const result = await collection.deleteOne({
        _id: new ObjectId(req.params.id),
    });

    res.json(result);
});

module.exports = productRoutes;