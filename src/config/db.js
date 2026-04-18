const { MongoClient, ServerApiVersion } = require("mongodb");

let client;
let db;

async function connectDB() {
    const uri = process.env.DB_URI; // 👈 move here (SAFE)

    if (!uri) {
        throw new Error("DB_URI is not defined in .env");
    }

    if (!db) {
        client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
        });

        await client.connect();

        db = client.db("pujaPonnoDB");
        console.log("✅ Connected to pujaPonnoDB");

        // ⚡ ENSURE INDEXES (FOR PRODUCTION)
        const orders = db.collection("orders");
        await orders.createIndex({ tran_id: 1 }, { unique: true });
        await orders.createIndex({ userId: 1 });
        await orders.createIndex({ "paymentStatus": 1 });
        console.log("⚡ Database Indexes Ensured");
    }

    return db;
}

async function getCollection(name) {
    const db = await connectDB();
    return db.collection(name);
}

module.exports = {
    connectDB,
    getCollection,
};