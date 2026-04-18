const SSL_BASE_URL = process.env.BASE_URL;

// CHANGE HERE WHEN LIVE:
// sandbox → https://sandbox.sslcommerz.com
// live → https://securepay.sslcommerz.com

module.exports = {
    initUrl: `${SSL_BASE_URL}/gwprocess/v4/api.php`,
    validationUrl: `${SSL_BASE_URL}/validator/api/validationserverAPI.php`
};