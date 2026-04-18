const { v4: uuidv4 } = require("uuid");

const generateTranId = () => {
    return "TXN_" + uuidv4();
};

module.exports = generateTranId;