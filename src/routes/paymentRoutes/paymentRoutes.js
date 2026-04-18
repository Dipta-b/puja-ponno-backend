const express = require("express");
const router = express.Router();
const axios = require("axios");

const { getCollection } = require("../../config/db");
const { calculatePricing } = require("../../utils/priceCalculator");
const { logPaymentStep } = require("../../utils/paymentLogger");
const validatePayment = require("../../utils/validatePayment");
const { sendSuccessEmail, sendFailEmail } = require("../../utils/emailService");
const generateTranId = require("../../utils/generateTranId");
const verifyToken = require("../../middleware/verifyToken");

// ==========================================
// 💳 1. INITIATE PAYMENT (CREATE ORDER)
// ==========================================
router.post("/create-payment", verifyToken, async (req, res) => {
    const tran_id = generateTranId();
    try {
        const { items, phone, address, deliveryArea } = req.body;
        const user = req.user;

        // 🛡️ SECURITY: Recalculate everything from DB
        const { items: enrichedItems, pricing } = await calculatePricing(items, deliveryArea);

        // 📝 CREATE ORDER IN DB
        const orders = await getCollection("orders");
        const order = {
            userId: user.id || user._id,
            tran_id: tran_id, // ⚡ ADDED TO ROOT TO MATCH UNIQUE INDEX
            customer: {
                name: user.name,
                email: user.email,
                phone,
                address
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
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await orders.insertOne(order);
        await logPaymentStep(tran_id, "ORDER_CREATED", { 
            pricing,
            customer_name: user.name,
            customer_email: user.email 
        });

        // 🚀 SSLCOMMERZ PAYLOAD
        const payload = new URLSearchParams({
            store_id: process.env.STORE_ID,
            store_passwd: process.env.STORE_PASS,
            total_amount: pricing.totalAmount,
            currency: pricing.currency,
            tran_id: tran_id,
            success_url: `${process.env.BASE_URL_BACKEND.replace(/\/$/, "")}/payment/success`,
            fail_url: `${process.env.BASE_URL_BACKEND.replace(/\/$/, "")}/payment/fail`,
            cancel_url: `${process.env.BASE_URL_BACKEND.replace(/\/$/, "")}/payment/cancel`,
            ipn_url: `${process.env.BASE_URL_BACKEND.replace(/\/$/, "")}/payment/ipn`,
            shipping_method: "NO",
            product_name: enrichedItems.map(i => i.name).join(", "),
            product_category: "Puja Elements",
            cus_name: user.name,
            cus_email: user.email,
            cus_phone: phone,
            cus_add1: address,
            cus_city: "Dhaka",
            cus_country: "Bangladesh"
        });

        const sslResponse = await axios.post(
            `${process.env.BASE_URL}/gwprocess/v4/api.php`,
            payload.toString(),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        if (sslResponse.data?.status === 'FAILED') {
            throw new Error(`SSLCommerz Error: ${sslResponse.data.failedreason || 'Unknown error'}`);
        }

        await logPaymentStep(tran_id, "SSL_INIT_RESPONSE", sslResponse.data);

        if (sslResponse.data?.GatewayPageURL) {
            res.json({ gatewayUrl: sslResponse.data.GatewayPageURL });
        } else {
            console.error("SSL Error Payload:", sslResponse.data);
            throw new Error(sslResponse.data?.failedreason || "SSLCommerz initialization failed");
        }

    } catch (err) {
        console.error("PAYMENT INIT ERROR:", err.message);
        await logPaymentStep(tran_id, "ERROR", { message: err.message });
        res.status(500).json({ 
            message: "Failed to initiate payment", 
            error: err.message,
            stack: process.env.NODE_ENV === 'production' ? null : err.stack 
        });
    }
});

// ==========================================
// ✅ 2. SUCCESS CALLBACK
// ==========================================
router.post("/success", async (req, res) => {
    const { tran_id, val_id, amount } = req.body;
    await logPaymentStep(tran_id, "SUCCESS_CALLBACK_RECEIVED", req.body);

    try {
        const orders = await getCollection("orders");
        const order = await orders.findOne({ "payment.transactionId": tran_id });

        if (!order) return res.status(404).send("Order not found");

        // 🛡️ IDEMPOTENCY: Check if already paid
        if (order.payment.status === "paid") {
            return res.redirect(`${process.env.BASE_URL_FRONTEND || 'http://localhost:5173'}/?payment=success`);
        }

        // 🛡️ VALIDATION: Double check with SSL API
        const validation = await validatePayment(val_id, process.env.STORE_ID, process.env.STORE_PASS);
        await logPaymentStep(tran_id, "VALIDATION_RESPONSE", validation);

        if (validation.status === "VALID" && Number(validation.amount) === Number(order.pricing.totalAmount)) {
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

            // 📧 Send Email
            try {
                await sendSuccessEmail({
                    ...order.customer,
                    tran_id: order.payment.transactionId,
                    amount: order.pricing.totalAmount,
                    items: order.items,
                    createdAt: order.createdAt
                });
            } catch (e) {
                console.error("Success email fail:", e.message);
            }

            return res.redirect(`${process.env.BASE_URL_FRONTEND || 'http://localhost:5173'}/?payment=success`);
        } else {
            throw new Error("Validation mismatch or invalid status");
        }

    } catch (err) {
        console.error("SUCCESS HANDLER ERROR:", err.message);
        res.redirect(`${process.env.BASE_URL_FRONTEND || 'http://localhost:5173'}/?payment=failed`);
    }
});

// ==========================================
// ❌ 3. FAIL / CANCEL CALLBACKS
// ==========================================
router.post("/fail", async (req, res) => {
    const { tran_id } = req.body;
    await logPaymentStep(tran_id, "FAIL_CALLBACK_RECEIVED", req.body);
    
    await getCollection("orders").updateOne(
        { "payment.transactionId": tran_id },
        { $set: { "payment.status": "failed", orderStatus: "failed", updatedAt: new Date() } }
    );

    res.redirect(`${process.env.BASE_URL_FRONTEND || 'http://localhost:5173'}/?payment=failed`);
});

router.post("/cancel", async (req, res) => {
    const { tran_id } = req.body;
    await logPaymentStep(tran_id, "CANCEL_CALLBACK_RECEIVED", req.body);

    await getCollection("orders").updateOne(
        { "payment.transactionId": tran_id },
        { $set: { "payment.status": "cancelled", orderStatus: "cancelled", updatedAt: new Date() } }
    );

    res.redirect(`${process.env.BASE_URL_FRONTEND || 'http://localhost:5173'}/?payment=cancelled`);
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
            const validation = await validatePayment(val_id, process.env.STORE_ID, process.env.STORE_PASS);
            
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
            }
        }
        res.send("IPN Processed");
    } catch (err) {
        console.error("IPN ERROR:", err.message);
        res.status(500).send("Error");
    }
});

module.exports = { paymentRoute: router };