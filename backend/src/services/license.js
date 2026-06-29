const crypto = require('crypto');

const SECRET = process.env.LICENSE_SECRET;
const TRIAL_LIMIT = 5;

// Generate a license key tied to a specific device
function generateLicenseKey(deviceId, expiryDate) {
  const payload = `${deviceId}:${expiryDate.toISOString()}`;
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  const encoded = Buffer.from(payload).toString('base64');
  return `RB2-${encoded}.${signature.slice(0, 16)}`;
}

// Verify a license key matches the device and is not expired
function verifyLicenseKey(deviceId, licenseKey) {
  try {
    if (!licenseKey?.startsWith('RB2-')) return false;
    const [encodedPart, sig] = licenseKey.slice(4).split('.');
    const payload = Buffer.from(encodedPart, 'base64').toString();
    const [storedDeviceId, expiryStr] = payload.split(':');
    if (storedDeviceId !== deviceId) return false;
    const expiry = new Date(expiryStr);
    if (expiry < new Date()) return false;
    const expectedSig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex').slice(0, 16);
    return sig === expectedSig;
  } catch {
    return false;
  }
}

module.exports = { generateLicenseKey, verifyLicenseKey, TRIAL_LIMIT };
