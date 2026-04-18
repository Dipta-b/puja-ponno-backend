const { getCollection } = require("../config/db");

/**
 * 📜 PAYMENT AUDIT LOGGING
 * Records every SSL interaction for security and debugging.
 */
const logPaymentStep = async (tran_id, step, data) => {
    try {
        const logsCollection = await getCollection("payment_logs");
        
        await logsCollection.insertOne({
            tran_id,
            step, // e.g., "INITIATED", "SUCCESS_CALLBACK", "IPN_RECEIVED", "VALIDATION_RESPONSE"
            data,
            timestamp: new Date()
        });
        
    } catch (err) {
        console.error("LOGGING ERROR:", err.message);
    }
};

module.exports = { logPaymentStep };
