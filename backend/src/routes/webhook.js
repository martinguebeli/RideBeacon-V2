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

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      // Fired on renewal, cancellation, past-due, etc. — the ongoing
      // source of truth for whether a device's subscription is entitled.
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionChange(event.data.object);
        break;

      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling webhook event ${event.type}:`, err);
    // Still ack the event — Stripe will retry on non-2xx, but a bug on our
    // side shouldn't cause Stripe to hammer us; log and investigate instead.
  }

  res.json({ received: true });
});

async function handleCheckoutCompleted(session) {
  const deviceId = session.metadata?.deviceId;
  if (!deviceId) {
    console.error('No deviceId in checkout session metadata');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const licenseKey = generateLicenseKey(deviceId, currentPeriodEnd);

  await db.setSubscription(deviceId, {
    stripeCustomerId: session.customer,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd,
    licenseKey,
  });

  console.log(`Subscription activated for device ${deviceId}, renews ${currentPeriodEnd.toISOString()}`);
}

async function handleSubscriptionChange(subscription) {
  const device = await db.getDeviceBySubscriptionId(subscription.id);
  if (!device) {
    console.error(`No device found for subscription ${subscription.id}`);
    return;
  }

  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
  const licenseKey = subscription.status === 'active'
    ? generateLicenseKey(device.device_id, currentPeriodEnd)
    : null;

  await db.setSubscription(device.device_id, {
    stripeCustomerId: subscription.customer,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd,
    licenseKey,
  });

  console.log(`Subscription ${subscription.status} for device ${device.device_id}`);
}

module.exports = router;
