const express = require("express");
const commentRoutes = express.Router();
const { ObjectId } = require("mongodb");

const verifyToken = require("../../middleware/verifyToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const { getCollection } = require("../../config/db");

/**
 * 🔥 GET ALL COMMENTS (Public or Admin panel use)
 */
commentRoutes.get("/", async (req, res) => {
    try {
        const collection = await getCollection("comments");

        const comments = await collection
            .find()
            .sort({ createdAt: -1 })
            .toArray();

        res.json(comments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * 🔥 GET COMMENTS BY PRODUCT
 */
commentRoutes.get("/product/:productId", async (req, res) => {
    try {
        const collection = await getCollection("comments");

        const comments = await collection
            .find({ productId: req.params.productId })
            .sort({ createdAt: -1 })
            .toArray();

        res.json(comments);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * 🔥 CREATE COMMENT (USER ONLY)
 */
commentRoutes.post("/", verifyToken, async (req, res) => {
    try {
        const collection = await getCollection("comments");

        const {
            productId,
            rating,
            description,
            image
        } = req.body;

        // ❌ validation
        if (!productId || !rating || !description) {
            return res.status(400).json({
                message: "productId, rating, description required"
            });
        }

        const comment = {
            productId,

            userId: req.user.id,
            email: req.user.email,
            role: req.user.role,

            name: req.user.name || "User",
            image: image || "",

            rating: Number(rating),
            description: description.trim(),

            createdAt: new Date()
        };

        const result = await collection.insertOne(comment);

        res.status(201).json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * 🔥 UPDATE COMMENT
 * USER can update ONLY OWN comment
 * ADMIN can update ANY comment
 */
commentRoutes.put("/:id", verifyToken, async (req, res) => {
    try {
        const collection = await getCollection("comments");

        const comment = await collection.findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const isOwner = comment.userId === req.user.id;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                message: "You can only edit your own comment"
            });
        }

        const updateData = {
            ...req.body,
            updatedAt: new Date()
        };

        delete updateData._id;
        delete updateData.userId;
        delete updateData.email;

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

/**
 * 🔥 DELETE COMMENT
 * USER can delete ONLY OWN comment
 * ADMIN can delete ANY comment
 */
commentRoutes.delete("/:id", verifyToken, async (req, res) => {
    try {
        const collection = await getCollection("comments");

        const comment = await collection.findOne({
            _id: new ObjectId(req.params.id)
        });

        if (!comment) {
            return res.status(404).json({ message: "Comment not found" });
        }

        const isOwner = comment.userId === req.user.id;
        const isAdmin = req.user.role === "admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                message: "You can only delete your own comment"
            });
        }

        const result = await collection.deleteOne({
            _id: new ObjectId(req.params.id)
        });

        res.json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * 🔥 ADMIN ONLY: FORCE DELETE ANY COMMENT (optional strict control)
 */
commentRoutes.delete(
    "/admin/:id",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
        try {
            const collection = await getCollection("comments");

            const result = await collection.deleteOne({
                _id: new ObjectId(req.params.id)
            });

            res.json(result);

        } catch (err) {
            console.error(err);
            res.status(500).json({ message: "Server error" });
        }
    }
);

module.exports = commentRoutes;