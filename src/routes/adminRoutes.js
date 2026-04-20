const express = require("express");
const router = express.Router();
const { getCollection } = require("../config/db");
const { ObjectId } = require("mongodb");
const verifyToken = require("../middleware/verifyToken");

const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * 📊 ANALYTICS: REVENUE STATS
 */
router.get("/stats/revenue", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const orders = await getCollection("orders");

        const stats = await orders.aggregate([
            { $match: { "payment.status": "paid" } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: "$pricing.totalAmount" },
                    totalOrders: { $count: {} },
                    avgOrderValue: { $avg: "$pricing.totalAmount" }
                }
            }
        ]).toArray();

        // 📅 DAILY REVENUE (Last 30 Days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const dailyRevenue = await orders.aggregate([
            { 
                $match: { 
                    "payment.status": "paid",
                    createdAt: { $gte: thirtyDaysAgo }
                } 
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    revenue: { $sum: "$pricing.totalAmount" }
                }
            },
            { $sort: { "_id": 1 } }
        ]).toArray();

        res.json({
            overview: stats[0] || { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 },
            dailyRevenue
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Stats generation failed" });
    }
});

/**
 * 🛡️ ANALYTICS: ORDER DISTRIBUTION
 */
router.get("/stats/orders", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const orders = await getCollection("orders");
        
        const distribution = await orders.aggregate([
            {
                $group: {
                    _id: "$orderStatus",
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        res.json(distribution);
    } catch (err) {
        res.status(500).json({ message: "Stats generation failed" });
    }
});

/**
 * 🏆 ANALYTICS: TOP PRODUCTS
 */
router.get("/stats/top-products", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const orders = await getCollection("orders");

        const topProducts = await orders.aggregate([
            { $match: { "payment.status": "paid" } },
            { $unwind: "$items" },
            {
                $group: {
                    _id: "$items.productId",
                    name: { $first: "$items.name" },
                    totalSold: { $sum: "$items.quantity" },
                    revenue: { $sum: "$items.subtotal" }
                }
            },
            { $sort: { totalSold: -1 } },
            { $limit: 10 }
        ]).toArray();

        res.json(topProducts);
    } catch (err) {
        res.status(500).json({ message: "Stats generation failed" });
    }
});

/**
 * 📜 TRANSACTION LOGS (AUDIT TRAIL)
 */
router.get("/logs/payments", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const logs = await getCollection("payment_logs");
        
        // 🔄 PRODUCTION-LEVEL AGGREGATION: Join logs with orders to ensure user data is ALWAYS available
        const allLogs = await logs.aggregate([
            { $sort: { timestamp: -1 } },
            { $limit: 100 },
            {
                $lookup: {
                    from: "orders",
                    localField: "tran_id",
                    foreignField: "payment.transactionId", // 🛡️ Using the most reliable field
                    as: "orderData"
                }
            },
            {
                $addFields: {
                    // Extract customer info from the joined order if available
                    customer: { $arrayElemAt: ["$orderData.customer", 0] },
                    // Inject helper for frontend
                    hasOrder: { $gt: [{ $size: "$orderData" }, 0] }
                }
            },
            {
                $project: {
                    orderData: 0 // Clean up join data
                }
            }
        ]).toArray();

        
        res.json(allLogs);
    } catch (err) {
        console.error("LOGS FETCH ERROR:", err);
        res.status(500).json({ message: "Failed to fetch logs" });
    }
});

/**
 * 🛡️ DELETE ALL PAYMENT LOGS (ADMIN ONLY)
 */
router.delete("/logs/payments/all", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const logs = await getCollection("payment_logs");
        await logs.deleteMany({});
        res.json({ success: true, message: "All logs cleared successfully" });
    } catch (err) {
        res.status(500).json({ message: "Failed to clear logs" });
    }
});

/**
 * 🛡️ DELETE SPECIFIC LOG (ADMIN ONLY)
 */
router.delete("/logs/payments/:id", verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const logs = await getCollection("payment_logs");
        const result = await logs.deleteOne({ _id: new ObjectId(id) });
        
        if (result.deletedCount === 0) return res.status(404).json({ message: "Log not found" });
        res.json({ success: true, message: "Log deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Failed to delete log" });
    }
});


module.exports = router;
