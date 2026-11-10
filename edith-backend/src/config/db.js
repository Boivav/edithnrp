const mongoose = require('mongoose');
const dns = require('dns');

/**
 * Configure DNS servers for reliable SRV record resolution on Windows and local networks.
 */
try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  // Ignored if DNS override is not permitted
}

let isConnecting = false;
let retryInterval = null;

function getNormalizedUri() {
  let uri = process.env.MONGODB_URI || 'mongodb+srv://manastalukdar57_db_user:1XstvcwOWiTTEh01@cluster0.7yavrry.mongodb.net/edith?retryWrites=true&w=majority';
  if (uri.endsWith('.mongodb.net/')) {
    uri = uri + 'edith?retryWrites=true&w=majority';
  } else if (uri.endsWith('.mongodb.net')) {
    uri = uri + '/edith?retryWrites=true&w=majority';
  }
  return uri;
}

/**
 * Connect to MongoDB Atlas cluster
 */
async function connectDB() {
  const uri = getNormalizedUri();
  isConnecting = true;

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to Atlas host: ${conn.connection.host} (DB: ${conn.connection.name})`);
    if (retryInterval) {
      clearInterval(retryInterval);
      retryInterval = null;
    }
    isConnecting = false;
    return conn;
  } catch (error) {
    isConnecting = false;
    console.warn(`[MongoDB Notice] Atlas connection failed: ${error.message}`);
    console.warn('[MongoDB Notice] Operating in resilient fallback mode while retrying Atlas in the background.');
    console.warn('[MongoDB Notice] To allow persistent Atlas storage, ensure your current IP is whitelisted in MongoDB Atlas Network Access (e.g. 0.0.0.0/0).');

    // Auto-reconnect in background
    if (!retryInterval) {
      retryInterval = setInterval(async () => {
        if (mongoose.connection.readyState === 1 || isConnecting) return;
        try {
          isConnecting = true;
          await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
          console.log('[MongoDB] Background reconnection to MongoDB Atlas succeeded!');
          clearInterval(retryInterval);
          retryInterval = null;
        } catch (e) {
          // Silent retry
        } finally {
          isConnecting = false;
        }
      }, 15000);
    }

    return null;
  }
}

module.exports = connectDB;
