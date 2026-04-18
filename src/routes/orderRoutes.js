const express = require("express");
const router = express.Router();
const { getCollection } = require("../config/db");
const { ObjectId } = require("mongodb");
const verifyToken = require("../middleware/verifyToken");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * 👤 GET MY ORDERS
 */
router.get("/my-orders", verifyToken, async (req, res) => {
    try {
        const orders = await getCollection("orders");
        const myOrders = await orders.find({ userId: req.user.id })
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json(myOrders);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch orders" });
    }
});

/**
 * 🛡️ UPDATE ORDER STATUS (ADMIN ONLY)
 */
router.put("/update-status/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { orderStatus } = req.body;

        const orders = await getCollection("orders");
        const result = await orders.updateOne(
            { _id: new ObjectId(id) },
            { $set: { orderStatus, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) return res.status(404).json({ message: "Order not found" });

        res.json({ success: true, message: `Status updated to ${orderStatus}` });
    } catch (err) {
        res.status(500).json({ message: "Update failed" });
    }
});

/**
 * 🛒 GET ALL ORDERS (ADMIN ONLY)
 */
router.get("/all-orders", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.query;
        const query = status ? { orderStatus: status } : {};
        
        const orders = await getCollection("orders");
        const allOrders = await orders.find(query)
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json(allOrders);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch orders" });
    }
});

/**
 * 🛡️ GET ORDERS BY USER ID (ADMIN ONLY)
 */
router.get("/user/:userId", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const orders = await getCollection("orders");
        const userOrders = await orders.find({ userId: userId })
            .sort({ createdAt: -1 })
            .toArray();
        
        res.json(userOrders);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch user orders" });
    }
});

module.exports = router;
