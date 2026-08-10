import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "node:dns";

// Make sure to configure dotenv before using process.env
dotenv.config();

// Do not queue model operations while the driver is disconnected. Callers can
// then return an explicit unavailable response instead of failing later with a
// misleading `buffering timed out` error.
mongoose.set("bufferCommands", false);

const RECONNECT_DELAY_MS = 10_000;
let connectionPromise = null;
let reconnectTimer = null;

// Node's DNS resolver is separate from the Windows resolver. Configure public
// DNS servers when a network's default DNS server rejects SRV queries, which
// Atlas requires for mongodb+srv connection strings.
const configureMongoDns = () => {
	const servers = process.env.MONGODB_DNS_SERVERS
		?.split(",")
		.map((server) => server.trim())
		.filter(Boolean);

	if (!servers?.length) return;

	try {
		dns.setServers(servers);
		console.log(`MongoDB SRV DNS servers configured: ${servers.join(", ")}`);
	} catch (error) {
		console.error(`Invalid MONGODB_DNS_SERVERS configuration: ${error.message}`);
	}
};

configureMongoDns();

const scheduleReconnect = () => {
	if (reconnectTimer || !process.env.MONGODB_URI) return;

	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		connectDB();
	}, RECONNECT_DELAY_MS);
	// A retry timer should not keep a process alive while it is shutting down.
	reconnectTimer.unref?.();
};

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;

export const connectDB = async () => {
	if (isDatabaseConnected()) return mongoose.connection;
	if (connectionPromise) return connectionPromise;

	const uri = process.env.MONGODB_URI;
	if (!uri) {
		console.error(
			"MongoDB is not configured: set MONGODB_URI in backend/.env."
		);
		scheduleReconnect();
		return null;
	}
	if (!uri.startsWith("mongodb+srv://") && !uri.startsWith("mongodb://")) {
		console.error("MONGODB_URI must use a valid mongodb:// or mongodb+srv:// connection string.");
		return null;
	}

	connectionPromise = (async () => {
		try {
			const conn = await mongoose.connect(uri, {
				bufferCommands: false,
				serverSelectionTimeoutMS: 15_000,
				connectTimeoutMS: 15_000,
			});
			console.log(`MongoDB Connected using mongodb+srv URI: ${conn.connection.host}`);
			return conn;
		} catch (error) {
			console.error(`MongoDB SRV connection failed: ${error.message}`);
		}

		console.error(`Retrying MongoDB connection in ${RECONNECT_DELAY_MS / 1000} seconds.`);
		scheduleReconnect();
		return null;
	})().finally(() => {
		connectionPromise = null;
	});

	return connectionPromise;
};
