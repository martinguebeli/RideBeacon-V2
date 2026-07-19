const { Client } = require('pg');
const EventEmitter = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // many devices can be waiting concurrently

let client;

// Opens a dedicated Postgres connection for LISTEN — this must be separate
// from the regular query pool, since a connection running LISTEN can't be
// reused for normal queries. Reconnects automatically if the connection drops
// (Render/managed Postgres can recycle idle connections).
async function initRealtime() {
  await connect();
}

async function connect() {
  client = new Client({ connectionString: process.env.DATABASE_URL });

  client.on('notification', (msg) => {
    if (msg.channel === 'device_updates') {
      emitter.emit(msg.payload);
    }
  });

  client.on('error', (err) => {
    console.error('Realtime listener connection error:', err.message);
  });

  client.on('end', () => {
    console.warn('Realtime listener connection closed, reconnecting in 2s...');
    setTimeout(() => connect().catch(err => console.error('Reconnect failed:', err)), 2000);
  });

  await client.connect();
  await client.query('LISTEN device_updates');
  console.log('Realtime listener ready (LISTEN device_updates)');
}

// Resolves as soon as deviceId is notified, or after timeoutMs — whichever
// comes first. Callers loop: call this, get a response, call it again. Each
// call ties up one HTTP connection but zero DB polling in between.
function waitForChange(deviceId, timeoutMs) {
  return new Promise((resolve) => {
    const onNotify = () => {
      clearTimeout(timer);
      resolve('changed');
    };
    const timer = setTimeout(() => {
      emitter.removeListener(deviceId, onNotify);
      resolve('timeout');
    }, timeoutMs);
    emitter.once(deviceId, onNotify);
  });
}

module.exports = { initRealtime, waitForChange };
