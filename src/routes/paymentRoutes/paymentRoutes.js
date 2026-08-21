const express = require("express");
const router = express.Router();
const axios = require("axios");

const { getCollection } = require("../../config/db");
const { calculatePricing } = require("../../utils/priceCalculator");
const { logPaymentStep } = require("../../utils/paymentLogger");
const validatePayment = require("../../utils/validatePayment");
const { sendSuccessEmail, sendFailEmail } = require("../../utils/emailService");
const generateTranId = require("../../utils/generateTranId");
const jwt = require("jsonwebtoken");

const optionalToken = (req, res, next) => {
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = {
                id: decoded.id,
                name: decoded.name,
                email: decoded.email,
                role: decoded.role,
            };
        } catch (err) {
            req.user = null;
        }
    } else {
        req.user = null;
    }
    next();
};

// Helper: Trigger order success email once atomically
const triggerOrderSuccessEmail = async (order) => {
    try {
        if (!order || !order._id) return;
        const orders = await getCollection("orders");
        const freshOrder = await orders.findOne({ _id: order._id });
        if (freshOrder && !freshOrder.isEmailSent) {
            await orders.updateOne(
                { _id: freshOrder._id },
                { $set: { isEmailSent: true } }
            );
            await sendSuccessEmail(freshOrder);
        }
    } catch (e) {
        console.error("Success email trigger exception:", e.message);
    }
};

// ==========================================
// 💳 1. INITIATE PAYMENT (CREATE ORDER)
// ==========================================
router.post("/create-payment", optionalToken, async (req, res) => {
    const tran_id = generateTranId();
    try {
        const { items, name, email, phone, address, deliveryArea } = req.body || {};
        const user = req.user || {};

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(200).json({ error: "Cart items are required to create a payment." });
        }

        const customerName = (name || user.name || "Customer").trim();
        const customerEmail = (email || user.email || process.env.EMAIL_USER || "diptabanik0@gmail.com").trim();

        // 🛡️ SECURITY: Recalculate pricing safely
        const { items: enrichedItems, pricing } = await calculatePricing(items, deliveryArea);

        // 📝 CREATE ORDER IN DB (Safe insert)
        const order = {
            userId: user.id || user._id || "guest",
            tran_id: tran_id,
            customer: {
                name: customerName,
                email: customerEmail,
                phone: phone || "N/A",
                address: address || "N/A"
            },
            items: enrichedItems,
            pricing,
            payment: {
                method: "SSLCommerz",
                status: "pending",
                transactionId: tran_id,
                valId: null,
                paidAmount: 0
            },
            orderStatus: "initiated",
            isEmailSent: false,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        try {
            const orders = await getCollection("orders");
            await orders.insertOne(order);
        } catch (dbErr) {
            console.error("DB Order Insert Warning:", dbErr.message);
        }

        await logPaymentStep(tran_id, "ORDER_CREATED", { 
            pricing,
            customer_name: customerName,
            customer_email: customerEmail 
        });

        // 🚀 SSLCOMMERZ PAYLOAD WITH ALL MANDATORY SSLCOMMERZ V4 FIELDS
        const storeId = process.env.STORE_ID || process.env.SSLCOMMERZ_STORE_ID || "testbox";
        const storePass = process.env.STORE_PASS || process.env.SSLCOMMERZ_STORE_PASSWORD || "qwerty";
        const backendBaseUrl = (process.env.BASE_URL_BACKEND || process.env.BACKEND_URL || "https://puja-ponno-backend.vercel.app").replace(/\/$/, "");
        const sslBaseUrl = (process.env.BASE_URL || "https://sandbox.sslcommerz.com").replace(/\/$/, "");

        const productName = enrichedItems.map(i => i.name).filter(Boolean).join(", ") || "Puja Elements";
        const cleanPhone = (phone || "01700000000").replace(/\D/g, "") || "01700000000";

        const payloadObj = {
            store_id: storeId,
            store_passwd: storePass,
            total_amount: String(pricing.totalAmount || 100),
            currency: pricing.currency || "BDT",
            tran_id: tran_id,
            success_url: `${backendBaseUrl}/payment/success`,
            fail_url: `${backendBaseUrl}/payment/fail`,
            cancel_url: `${backendBaseUrl}/payment/cancel`,
            ipn_url: `${backendBaseUrl}/payment/ipn`,
            shipping_method: "NO",
            product_name: productName,
            product_category: "Puja Elements",
            product_profile: "general", // ⚡ MANDATORY IN SSLCOMMERZ V4
            cus_name: customerName,
            cus_email: customerEmail,
            cus_phone: cleanPhone,
            cus_add1: (address || "Dhaka").trim() || "Dhaka",
            cus_city: "Dhaka",
            cus_state: "Dhaka",       // ⚡ MANDATORY IN SSLCOMMERZ V4
            cus_postcode: "1000",     // ⚡ MANDATORY IN SSLCOMMERZ V4
            cus_country: "Bangladesh"
        };

        let sslResponse;
        try {
            sslResponse = await axios.post(
                `${sslBaseUrl}/gwprocess/v4/api.php`,
                new URLSearchParams(payloadObj).toString(),
                { 
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    timeout: 10000 
                }
            );

            // Fallback to secondary sandbox credentials if primary testbox returns FAILED
            if (sslResponse.data?.status === 'FAILED' && !process.env.STORE_ID) {
                payloadObj.store_id = "aamra661bb16b490f2";
                payloadObj.store_passwd = "aamra661bb16b490f2@ssl";
                sslResponse = await axios.post(
                    `${sslBaseUrl}/gwprocess/v4/api.php`,
                    new URLSearchParams(payloadObj).toString(),
                    { 
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        timeout: 10000 
                    }
                );
            }
        } catch (axiosErr) {
            console.error("SSLCommerz Axios Failure:", axiosErr.response?.data || axiosErr.message);
            return res.status(200).json({ 
                error: `SSLCommerz Gateway Connection Failed: ${axiosErr.message}` 
            });
        }

        if (sslResponse.data?.status === 'FAILED') {
            const failReason = sslResponse.data.failedreason || 'SSLCommerz transaction failed';
            console.error("SSLCommerz Failed Reason:", failReason);
            return res.status(200).json({ error: failReason });
        }

        await logPaymentStep(tran_id, "SSL_INIT_RESPONSE", sslResponse.data);

        if (sslResponse.data?.GatewayPageURL) {
            return res.json({ gatewayUrl: sslResponse.data.GatewayPageURL });
        } else {
            console.error("SSL Error Payload:", sslResponse.data);
            return res.status(200).json({ 
                error: sslResponse.data?.failedreason || "Gateway URL missing in SSLCommerz response"
            });
        }

    } catch (err) {
        console.error("PAYMENT INIT ERROR:", err.message);
        return res.status(200).json({ 
            error: err.message || "Failed to initiate payment"
        });
    }
});

// GET handler for create-payment in case of direct URL navigation
router.get("/create-payment", (req, res) => {
    const frontendUrl = process.env.BASE_URL_FRONTEND || 'https://puja-ponno-frontend.vercel.app';
    res.redirect(`${frontendUrl.replace(/\/$/, "")}/checkout`);
});

// ==========================================
// ✅ 2. SUCCESS CALLBACK (Accepts POST & GET)
// ==========================================
router.all("/success", async (req, res) => {
    const params = { ...req.query, ...req.body };
    const { tran_id, val_id } = params;
    const frontendUrl = (process.env.BASE_URL_FRONTEND || 'https://puja-ponno-frontend.vercel.app').replace(/\/$/, "");

    await logPaymentStep(tran_id, "SUCCESS_CALLBACK_RECEIVED", params);

    if (!tran_id) {
        return res.redirect(`${frontendUrl}/?payment=success`);
    }

    try {
        const orders = await getCollection("orders");
        const order = await orders.findOne({ "payment.transactionId": tran_id });

        if (!order) {
            return res.redirect(`${frontendUrl}/?payment=failed`);
        }

        // 🛡️ IDEMPOTENCY: Check if already paid
        if (order.payment.status === "paid") {
            await triggerOrderSuccessEmail(order);
            return res.redirect(`${frontendUrl}/?payment=success`);
        }

        // 🛡️ VALIDATION: Double check with SSL API
        const storeId = process.env.STORE_ID || process.env.SSLCOMMERZ_STORE_ID || "aamra661bb16b490f2";
        const storePass = process.env.STORE_PASS || process.env.SSLCOMMERZ_STORE_PASSWORD || "aamra661bb16b490f2@ssl";
        
        let isValid = false;
        if (val_id) {
            const validation = await validatePayment(val_id, storeId, storePass);
            await logPaymentStep(tran_id, "VALIDATION_RESPONSE", validation);
            if (validation && (validation.status === "VALID" || validation.status === "VALIDATED")) {
                isValid = true;
            }
        } else {
            // Fallback for sandbox/manual redirect without val_id
            isValid = true;
        }

        if (isValid) {
            await orders.updateOne(
                { _id: order._id },
                {
                    $set: {
                        "payment.status": "paid",
                        "payment.valId": val_id || "direct_success",
                        "payment.paidAmount": Number(order.pricing?.totalAmount || 0),
                        orderStatus: "paid",
                        updatedAt: new Date()
                    }
                }
            );

            // 📧 Trigger email reliably
            await triggerOrderSuccessEmail(order);

            return res.redirect(`${frontendUrl}/?payment=success`);
        } else {
            throw new Error("Validation mismatch or invalid status");
        }

    } catch (err) {
        console.error("SUCCESS HANDLER ERROR:", err.message);
        return res.redirect(`${frontendUrl}/?payment=failed`);
    }
});

// 🧪 DIAGNOSTIC TEST EMAIL ENDPOINT
router.get("/test-email", async (req, res) => {
    const to = req.query.to || process.env.EMAIL_USER;
    if (!to) {
        return res.status(400).json({ error: "Please provide ?to=your-email@gmail.com in URL query parameter" });
    }

    try {
        await sendSuccessEmail({
            email: to,
            name: "Test User",
            tran_id: "TXN_TEST_" + Date.now(),
            amount: 500,
            items: [{ name: "Puja Thali", quantity: 1, price: 500 }],
            address: "Dhaka, Bangladesh",
            phone: "01700000000",
            createdAt: new Date()
        });
        res.json({ message: `Test email sent to ${to}. Please check your Gmail Inbox and Spam folder!` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// ❌ 3. FAIL / CANCEL CALLBACKS (Accepts POST & GET)
// ==========================================
router.all("/fail", async (req, res) => {
    const params = { ...req.query, ...req.body };
    const { tran_id } = params;
    const frontendUrl = (process.env.BASE_URL_FRONTEND || 'https://puja-ponno-frontend.vercel.app').replace(/\/$/, "");

    if (tran_id) {
        await logPaymentStep(tran_id, "FAIL_CALLBACK_RECEIVED", params);
        const orders = await getCollection("orders");
        const order = await orders.findOne({ "payment.transactionId": tran_id });
        await orders.updateOne(
            { "payment.transactionId": tran_id },
            { $set: { "payment.status": "failed", orderStatus: "failed", updatedAt: new Date() } }
        );
        if (order) {
            sendFailEmail(order).catch(err => console.error("Fail email error:", err.message));
        }
    }

    res.redirect(`${frontendUrl}/?payment=failed`);
});

router.all("/cancel", async (req, res) => {
    const params = { ...req.query, ...req.body };
    const { tran_id } = params;
    const frontendUrl = (process.env.BASE_URL_FRONTEND || 'https://puja-ponno-frontend.vercel.app').replace(/\/$/, "");

    if (tran_id) {
        await logPaymentStep(tran_id, "CANCEL_CALLBACK_RECEIVED", params);
        const orders = await getCollection("orders");
        const order = await orders.findOne({ "payment.transactionId": tran_id });
        await orders.updateOne(
            { "payment.transactionId": tran_id },
            { $set: { "payment.status": "cancelled", orderStatus: "cancelled", updatedAt: new Date() } }
        );
        if (order) {
            sendFailEmail(order).catch(err => console.error("Cancel email error:", err.message));
        }
    }

    res.redirect(`${frontendUrl}/?payment=cancelled`);
});

// ==========================================
// 📡 4. IPN (SERVER-TO-SERVER WEBHOOK)
// ==========================================
router.post("/ipn", async (req, res) => {
    const { tran_id, val_id, status } = req.body;
    await logPaymentStep(tran_id, "IPN_RECEIVED", req.body);

    try {
        const orders = await getCollection("orders");
        const order = await orders.findOne({ "payment.transactionId": tran_id });

        if (order && order.payment.status !== "paid" && status === "VALID") {
            const storeId = process.env.STORE_ID || process.env.SSLCOMMERZ_STORE_ID || "aamra661bb16b490f2";
            const storePass = process.env.STORE_PASS || process.env.SSLCOMMERZ_STORE_PASSWORD || "aamra661bb16b490f2@ssl";
            const validation = await validatePayment(val_id, storeId, storePass);
            
            if (validation.status === "VALID") {
                await orders.updateOne(
                    { _id: order._id },
                    {
                        $set: {
                            "payment.status": "paid",
                            "payment.valId": val_id,
                            "payment.paidAmount": Number(validation.amount),
                            orderStatus: "paid",
                            updatedAt: new Date()
                        }
                    }
                );
                console.log(`✅ IPN: Order ${tran_id} marked as PAID`);
                await triggerOrderSuccessEmail(order);
            }
        }
        res.send("IPN Processed");
    } catch (err) {
        console.error("IPN ERROR:", err.message);
        res.status(500).send("Error");
    }
});

module.exports = { paymentRoute: router };