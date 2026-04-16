const { ObjectId } = require("mongodb");
const { getCollection } = require("../config/db");

const verifyAdmin = async (req, res, next) => {
    try {
        // req.user must come from verifyToken middleware
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const usersCollection = await getCollection("users");

        const user = await usersCollection.findOne({
            _id: new ObjectId(req.user.id)
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }
        const allowedRoles = ["admin"];

        if (!user.role || !allowedRoles.includes(user.role)) {
            return res.status(403).json({
                message: "Access denied: Admin only area"
            });
        }

        next();

    } catch (error) {
        console.error("verifyAdmin error:", error);
        res.status(500).json({
            message: "Server error"
        });
    }
};

module.exports = verifyAdmin;