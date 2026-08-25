const { MongoClient, ServerApiVersion } = require("mongodb");
const dns = require("dns");

// Apply IPv4 preference safely
if (dns && dns.setDefaultResultOrder) {
    try {
        dns.setDefaultResultOrder("ipv4first");
    } catch (e) {
        // Ignore if unsupported
    }
}

// Only override DNS servers in local Windows development if explicitly needed
if (process.platform === "win32" && !process.env.VERCEL) {
    try {
        dns.setServers(["8.8.8.8", "1.1.1.1"]);
    } catch (e) {
        // Ignore if not permitted
    }
}

let client;
let clientPromise;
let db;
let indexesInitialized = false;

function getClientPromise() {
    const uri = process.env.DB_URI || process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("DB_URI or MONGODB_URI is not defined in environment variables");
    }

    if (!clientPromise) {
        client = new MongoClient(uri, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
            maxPoolSize: 10,
            minPoolSize: 0,
            maxIdleTimeMS: 30000,
            serverSelectionTimeoutMS: 8000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 30000,
        });
        clientPromise = client.connect();
    }

    return clientPromise;
}

async function connectDB() {
    if (db) {
        return db;
    }

    const connectedClient = await getClientPromise();
    db = connectedClient.db("pujaPonnoDB");
    console.log("✅ Connected to pujaPonnoDB");

    // Initialize indexes in background without blocking request
    if (!indexesInitialized) {
        indexesInitialized = true;
        (async () => {
            try {
                const orders = db.collection("orders");
                await orders.createIndex({ tran_id: 1 }, { unique: true });
                await orders.createIndex({ userId: 1 });
                await orders.createIndex({ "paymentStatus": 1 });
            } catch (e) {
                console.warn("Index background warning:", e.message);
            }
        })();
    }

    return db;
}

async function getCollection(name) {
    const database = await connectDB();
    return database.collection(name);
}

module.exports = {
    connectDB,
    getCollection,
};