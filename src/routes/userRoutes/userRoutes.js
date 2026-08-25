const express = require("express");
const userRoutes = express.Router();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { ObjectId } = require("mongodb");
const crypto = require("crypto");
const { getCollection } = require("../../config/db");
const verifyToken = require("../../middleware/verifyToken");
const verifyAdmin = require("../../middleware/verifyAdmin");
const { sendPasswordResetOTP } = require("../../utils/emailService");

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
            passwordChangedAt: new Date()
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

        const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";

        res.cookie("token", token, {
            httpOnly: true,
            secure: !isLocalhost,
            sameSite: isLocalhost ? "lax" : "none",
            path: "/",
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

// =====================================================
// FORGOT PASSWORD - STEP 1
// Send OTP to user's email
// =====================================================
userRoutes.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        // ---------------------------------------------
        // Validate email
        // ---------------------------------------------
        if (!email || typeof email !== "string") {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const normalizedEmail = email
            .trim()
            .toLowerCase();

        if (!normalizedEmail) {
            return res.status(400).json({
                message: "Email is required"
            });
        }

        const users = await getCollection("users");

        // ---------------------------------------------
        // Find user
        // ---------------------------------------------
        const user = await users.findOne({
            email: normalizedEmail
        });

        /*
         * Don't reveal whether an email exists.
         *
         * This prevents attackers from using this
         * endpoint to discover registered accounts.
         */
        if (!user) {
            return res.json({
                message:
                    "If an account exists with this email, an OTP has been sent."
            });
        }

        // ---------------------------------------------
        // Prevent OTP spam
        //
        // One OTP request every 60 seconds.
        // ---------------------------------------------
        if (user.passwordResetLastSentAt) {
            const lastSentTime = new Date(
                user.passwordResetLastSentAt
            ).getTime();

            const elapsedSeconds =
                (Date.now() - lastSentTime) / 1000;

            if (elapsedSeconds < 60) {
                const remainingSeconds = Math.ceil(
                    60 - elapsedSeconds
                );

                return res.status(429).json({
                    message:
                        `Please wait ${remainingSeconds} seconds before requesting another OTP.`
                });
            }
        }

        // ---------------------------------------------
        // Generate secure 6-digit OTP
        // ---------------------------------------------
        const otp = crypto
            .randomInt(100000, 1000000)
            .toString();

        // ---------------------------------------------
        // Hash OTP before storing in MongoDB
        // ---------------------------------------------
        const hashedOTP = await bcrypt.hash(
            otp,
            10
        );

        // ---------------------------------------------
        // OTP expires after 10 minutes
        // ---------------------------------------------
        const otpExpiresAt = new Date(
            Date.now() + 10 * 60 * 1000
        );

        // ---------------------------------------------
        // Save OTP information
        //
        // Also invalidate any previous reset token.
        // ---------------------------------------------
        await users.updateOne(
            {
                _id: user._id
            },
            {
                $set: {
                    passwordResetOTP: hashedOTP,

                    passwordResetOTPExpiresAt:
                        otpExpiresAt,

                    passwordResetOTPAttempts: 0,

                    passwordResetLastSentAt:
                        new Date()
                },

                // Remove any previous reset session
                $unset: {
                    passwordResetTokenHash: true,

                    passwordResetTokenExpiresAt: true
                }
            }
        );

        // ---------------------------------------------
        // Send OTP email
        // ---------------------------------------------
        const emailSent =
            await sendPasswordResetOTP(
                normalizedEmail,
                otp
            );

        // ---------------------------------------------
        // If email fails, remove temporary OTP data
        // ---------------------------------------------
        if (!emailSent) {
            await users.updateOne(
                {
                    _id: user._id
                },
                {
                    $unset: {
                        passwordResetOTP: true,

                        passwordResetOTPExpiresAt: true,

                        passwordResetOTPAttempts: true,

                        passwordResetLastSentAt: true
                    }
                }
            );

            return res.status(500).json({
                message:
                    "Unable to send OTP email. Please try again."
            });
        }

        // ---------------------------------------------
        // Success
        // ---------------------------------------------
        return res.json({
            message:
                "If an account exists with this email, an OTP has been sent."
        });

    } catch (err) {
        console.error(
            "Forgot password error:",
            err
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
});


// =====================================================
// FORGOT PASSWORD - STEP 2
// Verify OTP
// =====================================================
userRoutes.post("/verify-reset-otp", async (req, res) => {
    try {
        const {
            email,
            otp
        } = req.body;

        // ---------------------------------------------
        // Validate request
        // ---------------------------------------------
        if (
            !email ||
            typeof email !== "string" ||
            !otp
        ) {
            return res.status(400).json({
                message:
                    "Email and OTP are required"
            });
        }

        const normalizedEmail = email
            .trim()
            .toLowerCase();

        const cleanOTP = String(otp).trim();

        // ---------------------------------------------
        // OTP must contain exactly 6 digits
        // ---------------------------------------------
        if (!/^\d{6}$/.test(cleanOTP)) {
            return res.status(400).json({
                message:
                    "OTP must be exactly 6 digits"
            });
        }

        const users = await getCollection("users");

        // ---------------------------------------------
        // Find user
        // ---------------------------------------------
        const user = await users.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(400).json({
                message:
                    "Invalid or expired OTP"
            });
        }

        // ---------------------------------------------
        // Make sure OTP exists
        // ---------------------------------------------
        if (
            !user.passwordResetOTP ||
            !user.passwordResetOTPExpiresAt
        ) {
            return res.status(400).json({
                message:
                    "Invalid or expired OTP"
            });
        }

        // ---------------------------------------------
        // Get attempt count
        // ---------------------------------------------
        const attempts =
            user.passwordResetOTPAttempts || 0;

        // ---------------------------------------------
        // Maximum 5 attempts
        // ---------------------------------------------
        if (attempts >= 5) {
            await users.updateOne(
                {
                    _id: user._id
                },
                {
                    $unset: {
                        passwordResetOTP: true,

                        passwordResetOTPExpiresAt: true,

                        passwordResetOTPAttempts: true,

                        passwordResetLastSentAt: true
                    }
                }
            );

            return res.status(429).json({
                message:
                    "Too many incorrect attempts. Please request a new OTP."
            });
        }

        // ---------------------------------------------
        // Check OTP expiration
        // ---------------------------------------------
        const otpExpiryTime = new Date(
            user.passwordResetOTPExpiresAt
        ).getTime();

        if (otpExpiryTime <= Date.now()) {
            await users.updateOne(
                {
                    _id: user._id
                },
                {
                    $unset: {
                        passwordResetOTP: true,

                        passwordResetOTPExpiresAt: true,

                        passwordResetOTPAttempts: true,

                        passwordResetLastSentAt: true
                    }
                }
            );

            return res.status(400).json({
                message:
                    "OTP has expired. Please request a new OTP."
            });
        }

        // ---------------------------------------------
        // Compare entered OTP with stored bcrypt hash
        // ---------------------------------------------
        const otpMatches =
            await bcrypt.compare(
                cleanOTP,
                user.passwordResetOTP
            );

        // ---------------------------------------------
        // Wrong OTP
        // ---------------------------------------------
        if (!otpMatches) {
            const newAttempts =
                attempts + 1;

            // -----------------------------------------
            // Fifth failed attempt:
            // completely destroy the OTP
            // -----------------------------------------
            if (newAttempts >= 5) {
                await users.updateOne(
                    {
                        _id: user._id
                    },
                    {
                        $unset: {
                            passwordResetOTP: true,

                            passwordResetOTPExpiresAt: true,

                            passwordResetOTPAttempts: true,

                            passwordResetLastSentAt: true
                        }
                    }
                );

                return res.status(429).json({
                    message:
                        "Too many incorrect attempts. Please request a new OTP."
                });
            }

            // -----------------------------------------
            // Otherwise increase failed attempts
            // -----------------------------------------
            await users.updateOne(
                {
                    _id: user._id
                },
                {
                    $set: {
                        passwordResetOTPAttempts:
                            newAttempts
                    }
                }
            );

            return res.status(400).json({
                message:
                    "Invalid OTP"
            });
        }

        // =================================================
        // OTP IS CORRECT
        // =================================================

        // ---------------------------------------------
        // Generate secure temporary reset token
        // ---------------------------------------------
        const resetToken =
            crypto
                .randomBytes(32)
                .toString("hex");

        // ---------------------------------------------
        // Hash reset token before storing it
        // ---------------------------------------------
        const resetTokenHash =
            crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");

        // ---------------------------------------------
        // Reset token expires after 15 minutes
        // ---------------------------------------------
        const resetTokenExpiresAt = new Date(
            Date.now() + 15 * 60 * 1000
        );

        // ---------------------------------------------
        // Store reset token
        //
        // IMPORTANT:
        // The OTP is deleted immediately.
        //
        // Therefore this OTP can never be reused.
        // ---------------------------------------------
        await users.updateOne(
            {
                _id: user._id
            },
            {
                $set: {
                    passwordResetTokenHash:
                        resetTokenHash,

                    passwordResetTokenExpiresAt:
                        resetTokenExpiresAt
                },

                // -------------------------------------
                // Completely remove OTP data
                // -------------------------------------
                $unset: {
                    passwordResetOTP: true,

                    passwordResetOTPExpiresAt: true,

                    passwordResetOTPAttempts: true,

                    passwordResetLastSentAt: true
                }
            }
        );

        // ---------------------------------------------
        // Send reset token to frontend
        //
        // MongoDB only has the HASH.
        // ---------------------------------------------
        return res.json({
            message:
                "OTP verified successfully",

            resetToken
        });

    } catch (err) {
        console.error(
            "Verify reset OTP error:",
            err
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
});


// =====================================================
// FORGOT PASSWORD - STEP 3
// Reset password
// =====================================================
userRoutes.post("/reset-password", async (req, res) => {
    try {
        const {
            email,
            resetToken,
            newPassword
        } = req.body;

        // ---------------------------------------------
        // Validate request
        // ---------------------------------------------
        if (
            !email ||
            typeof email !== "string" ||
            !resetToken ||
            typeof resetToken !== "string" ||
            !newPassword ||
            typeof newPassword !== "string"
        ) {
            return res.status(400).json({
                message:
                    "Email, reset token and new password are required"
            });
        }

        const normalizedEmail = email
            .trim()
            .toLowerCase();

        const cleanResetToken =
            resetToken.trim();

        // ---------------------------------------------
        // Password validation
        // ---------------------------------------------
        if (newPassword.length < 8) {
            return res.status(400).json({
                message:
                    "Password must be at least 8 characters"
            });
        }

        if (newPassword.length > 128) {
            return res.status(400).json({
                message:
                    "Password cannot exceed 128 characters"
            });
        }

        // ---------------------------------------------
        // Validate reset token format
        //
        // 32 random bytes = 64 hex characters
        // ---------------------------------------------
        if (
            !/^[a-fA-F0-9]{64}$/.test(
                cleanResetToken
            )
        ) {
            return res.status(400).json({
                message:
                    "Invalid password reset token"
            });
        }

        const users = await getCollection("users");

        // ---------------------------------------------
        // Find user
        // ---------------------------------------------
        const user = await users.findOne({
            email: normalizedEmail
        });

        if (!user) {
            return res.status(400).json({
                message:
                    "Invalid password reset request"
            });
        }

        // ---------------------------------------------
        // Make sure reset session exists
        // ---------------------------------------------
        if (
            !user.passwordResetTokenHash ||
            !user.passwordResetTokenExpiresAt
        ) {
            return res.status(400).json({
                message:
                    "Reset session is invalid or expired"
            });
        }

        // ---------------------------------------------
        // Check reset-token expiration
        // ---------------------------------------------
        const resetTokenExpiry =
            new Date(
                user.passwordResetTokenExpiresAt
            ).getTime();

        if (resetTokenExpiry <= Date.now()) {

            // Remove expired reset session
            await users.updateOne(
                {
                    _id: user._id
                },
                {
                    $unset: {
                        passwordResetTokenHash: true,

                        passwordResetTokenExpiresAt: true
                    }
                }
            );

            return res.status(400).json({
                message:
                    "Reset session has expired. Please start again."
            });
        }

        // ---------------------------------------------
        // Hash reset token received from frontend
        // ---------------------------------------------
        const receivedTokenHash =
            crypto
                .createHash("sha256")
                .update(cleanResetToken)
                .digest("hex");

        // ---------------------------------------------
        // Compare token hash
        // ---------------------------------------------
        if (
            receivedTokenHash !==
            user.passwordResetTokenHash
        ) {
            return res.status(400).json({
                message:
                    "Invalid password reset token"
            });
        }

        // ---------------------------------------------
        // Hash new password
        // ---------------------------------------------
        const hashedPassword =
            await bcrypt.hash(
                newPassword,
                12
            );

        // ---------------------------------------------
        // CURRENT TIME
        //
        // This timestamp is used by verifyToken to
        // invalidate all JWTs created before this time.
        // ---------------------------------------------
        const passwordChangedAt =
            new Date();

        // ---------------------------------------------
        // Final password update
        //
        // The query itself checks:
        // 1. User ID
        // 2. Correct reset token hash
        // 3. Token is not expired
        //
        // This makes the reset token one-time use.
        // ---------------------------------------------
        const result = await users.updateOne(
            {
                _id: user._id,

                passwordResetTokenHash:
                    receivedTokenHash,

                passwordResetTokenExpiresAt: {
                    $gt: new Date()
                }
            },
            {
                $set: {
                    password: hashedPassword,

                    passwordChangedAt:
                        passwordChangedAt
                },

                // -------------------------------------
                // DELETE ALL PASSWORD RESET DATA
                // -------------------------------------
                $unset: {
                    passwordResetTokenHash: true,

                    passwordResetTokenExpiresAt: true,

                    passwordResetOTP: true,

                    passwordResetOTPExpiresAt: true,

                    passwordResetOTPAttempts: true,

                    passwordResetLastSentAt: true
                }
            }
        );

        // ---------------------------------------------
        // Nothing changed
        //
        // Token may have already been used or expired.
        // ---------------------------------------------
        if (result.modifiedCount !== 1) {
            return res.status(400).json({
                message:
                    "Password reset session is invalid or expired. Please start again."
            });
        }

        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------
        return res.json({
            message:
                "Password changed successfully. All previous sessions have been logged out."
        });

    } catch (err) {
        console.error(
            "Reset password error:",
            err
        );

        return res.status(500).json({
            message: "Server error"
        });
    }
});


// =======================
// CURRENT USER
// =======================
userRoutes.get("/me", async (req, res) => {
    try {
        const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
        if (!token) {
            return res.json(null);
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
            return res.json(null);
        }

        const users = await getCollection("users");
        const user = await users.findOne(
            { _id: new ObjectId(decoded.id) },
            { projection: { password: 0 } }
        );

        if (!user) {
            return res.json(null);
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
    const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";

    res.clearCookie("token", {
        httpOnly: true,
        secure: !isLocalhost,
        sameSite: isLocalhost ? "lax" : "none",
        path: "/",
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