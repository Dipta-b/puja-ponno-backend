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