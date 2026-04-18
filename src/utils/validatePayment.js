const axios = require("axios");
const { validationUrl } = require("./sslcommerz");

const validatePayment = async (val_id, store_id, store_passwd) => {
    try {
        const url = `${validationUrl}?val_id=${val_id}&store_id=${store_id}&store_passwd=${store_passwd}&format=json`;

        const response = await axios.get(url);
        return response.data;
    } catch (err) {
        console.error("Validation Error:", err.message);
        return null;
    }
};

module.exports = validatePayment;