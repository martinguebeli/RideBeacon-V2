const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS devices (
      device_id     TEXT PRIMARY KEY,
      trial_count   INTEGER DEFAULT 0,
      license_key   TEXT,
      licensed_until TIMESTAMPTZ,
      stripe_customer_id TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('Database ready');
}

async function getDevice(deviceId) {
  const { rows } = await pool.query('SELECT * FROM devices WHERE device_id = $1', [deviceId]);
  return rows[0] || null;
}

async function registerDevice(deviceId) {
  const { rows } = await pool.query(
    `INSERT INTO devices (device_id) VALUES ($1)
     ON CONFLICT (device_id) DO UPDATE SET device_id = EXCLUDED.device_id
     RETURNING *`,
    [deviceId]
  );
  return rows[0];
}

async function incrementTrial(deviceId) {
  const { rows } = await pool.query(
    `UPDATE devices SET trial_count = trial_count + 1 WHERE device_id = $1 RETURNING trial_count`,
    [deviceId]
  );
  return rows[0]?.trial_count;
}

async function activateLicense(deviceId, licenseKey, stripeCustomerId) {
  const licensedUntil = new Date();
  licensedUntil.setFullYear(licensedUntil.getFullYear() + 1);
  await pool.query(
    `UPDATE devices SET license_key = $2, licensed_until = $3, stripe_customer_id = $4
     WHERE device_id = $1`,
    [deviceId, licenseKey, licensedUntil, stripeCustomerId]
  );
  return licensedUntil;
}

module.exports = { init, getDevice, registerDevice, incrementTrial, activateLicense };
