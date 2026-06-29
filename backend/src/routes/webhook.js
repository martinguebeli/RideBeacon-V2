const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../db');
const { generateLicenseKey } = require('../services/license');

// POST /webhook/stripe
// Must receive raw body — configured in index.js before JSON middleware
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const deviceId = session.metadata?.deviceId;
    const stripeCustomerId = session.customer;

    if (!deviceId) {
      console.error('No deviceId in session metadata');
      return res.json({ received: true });
    }

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    const licenseKey = generateLicenseKey(deviceId, expiryDate);

    await db.activateLicense(deviceId, licenseKey, stripeCustomerId);
    console.log(`License activated for device ${deviceId} until ${expiryDate.toISOString()}`);
  }

  res.json({ received: true });
});

module.exports = router;
