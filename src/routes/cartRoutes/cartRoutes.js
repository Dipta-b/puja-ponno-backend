const express = require("express");
const cartRoutes = express.Router();
const { getCollection } = require("../../config/db");
const { ObjectId } = require("mongodb");
const verifyToken = require("../../middleware/verifyToken");

// 🔐 SAFE USER FETCH HELPER (reused everywhere)
const getUser = async (req) => {
    const usersCollection = await getCollection("users");

    const user = await usersCollection.findOne({
        _id: new ObjectId(req.user.id)
    });

    return user;
};

// ===============================
// 🛒 GET CART (USER ONLY)
// ===============================
cartRoutes.get("/", verifyToken, async (req, res) => {
    try {
        const user = await getUser(req);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const cartCollection = await getCollection("carts");

        const cart = await cartCollection.findOne({
            userId: user._id.toString(),
            userEmail: user.email,
        });

        return res.json({
            items: cart?.items || [],
        });

    } catch (err) {
        console.error("GET CART ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});


// ===============================
// 🛒 CREATE / UPDATE CART
// ===============================
cartRoutes.post("/", verifyToken, async (req, res) => {
    try {
        const user = await getUser(req);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        let items = req.body.items;

        // 🔒 VALIDATION
        if (!Array.isArray(items)) {
            return res.status(400).json({ message: "Invalid cart format" });
        }

        // 🔥 CLEAN ITEMS (SECURITY FIX)
        items = items
            .filter(i => i && i._id)
            .map(i => ({
                _id: i._id,
                name: i.name || "",
                price: Number(i.price) || 0,
                quantity: Number(i.quantity) || 1,
                thumbnail: i.thumbnail || ""
            }))
            .filter(i => i.quantity > 0);

        const cartCollection = await getCollection("carts");

        await cartCollection.updateOne(
            {
                userId: user._id.toString(),
                userEmail: user.email,
            },
            {
                $set: {
                    items,
                    updatedAt: new Date(),
                }
            },
            { upsert: true }
        );

        return res.json({
            success: true,
            message: "Cart updated successfully",
            items
        });

    } catch (err) {
        console.error("UPDATE CART ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});


// ===============================
// 🧹 CLEAR CART
// ===============================
cartRoutes.delete("/", verifyToken, async (req, res) => {
    try {
        const user = await getUser(req);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const cartCollection = await getCollection("carts");

        await cartCollection.deleteOne({
            userId: user._id.toString(),
            userEmail: user.email,
        });

        return res.json({
            success: true,
            message: "Cart cleared successfully"
        });

    } catch (err) {
        console.error("CLEAR CART ERROR:", err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = cartRoutes;