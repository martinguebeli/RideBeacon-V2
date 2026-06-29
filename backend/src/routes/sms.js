const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendSms } = require('../services/sms');
const { verifyLicenseKey, TRIAL_LIMIT } = require('../services/license');

// POST /api/sms/send
// Body: { deviceId, licenseKey, phone, message }
router.post('/send', async (req, res) => {
  const { deviceId, licenseKey, phone, message } = req.body;

  if (!deviceId || !phone || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not registered' });

  // Check if licensed
  const isLicensed = licenseKey && verifyLicenseKey(deviceId, licenseKey);

  if (!isLicensed) {
    // Check trial limit
    if (device.trial_count >= TRIAL_LIMIT) {
      return res.status(402).json({
        error: 'trial_expired',
        message: 'Trial limit reached. Please subscribe to continue.',
      });
    }
    await db.incrementTrial(deviceId);
  }

  try {
    await sendSms(phone, message);
    const remaining = isLicensed ? null : TRIAL_LIMIT - device.trial_count - 1;
    return res.json({
      success: true,
      licensed: isLicensed,
      trialRemaining: remaining,
    });
  } catch (err) {
    console.error('SMS send error:', err);
    return res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// POST /api/sms/register
// Registers a new device and returns trial status
router.post('/register', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const device = await db.registerDevice(deviceId);
  return res.json({
    deviceId: device.device_id,
    trialCount: device.trial_count,
    trialRemaining: Math.max(0, TRIAL_LIMIT - device.trial_count),
    licensed: !!device.license_key && new Date(device.licensed_until) > new Date(),
    licensedUntil: device.licensed_until,
  });
});

// GET /api/sms/status/:deviceId
router.get('/status/:deviceId', async (req, res) => {
  const device = await db.getDevice(req.params.deviceId);
  if (!device) return res.status(404).json({ error: 'Device not found' });

  const licensed = !!device.license_key && new Date(device.licensed_until) > new Date();
  return res.json({
    trialCount: device.trial_count,
    trialRemaining: Math.max(0, TRIAL_LIMIT - device.trial_count),
    licensed,
    licensedUntil: device.licensed_until,
    licenseKey: licensed ? device.license_key : null,
  });
});

module.exports = router;
