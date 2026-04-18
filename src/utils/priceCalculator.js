const { getCollection } = require("../config/db");
const { ObjectId } = require("mongodb");

/**
 * 🔐 SECURE PRICE CALCULATION
 * Fetches every product from DB and recalculates total.
 * Never trust price from frontend.
 */
const calculatePricing = async (items, deliveryArea) => {
    if (!Array.isArray(items)) {
        throw new Error("Items must be an array");
    }

    const productsCollection = await getCollection("products");
    
    let subtotal = 0;
    const enrichedItems = [];

    for (const item of items) {
        const id = item.id || item._id;
        
        // 🛡️ Safety check: Is it a valid MongoDB ID?
        if (!id || !ObjectId.isValid(id)) {
            console.warn(`Skipping invalid item ID: ${id}`);
            continue;
        }
        
        const product = await productsCollection.findOne({ _id: new ObjectId(id) });

        if (!product) {
            throw new Error(`Product not found: ${id}`);
        }

        // Use discount price if available, else regular price
        const price = Number(product.discountPrice || product.price);
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const itemTotal = price * quantity;

        subtotal += itemTotal;

        enrichedItems.push({
            productId: product._id.toString(),
            name: product.name,
            price: price,
            quantity: quantity,
            subtotal: itemTotal,
            thumbnail: product.thumbnail || ""
        });
    }

    // Pricing Logic (Hardcoded for now, but encapsulated)
    const deliveryCharge = deliveryArea === 'inside' ? 60 : 120;
    const totalAmount = subtotal + deliveryCharge;

    return {
        items: enrichedItems,
        pricing: {
            subtotal,
            deliveryCharge,
            discount: 0, // Placeholder for coupon logic later
            totalAmount,
            currency: "BDT"
        }
    };
};

module.exports = { calculatePricing };
