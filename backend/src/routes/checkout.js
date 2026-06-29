const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../db');

// POST /api/checkout/session
// Creates a Stripe checkout session for $12/year
router.post('/session', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const device = await db.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: 'Device not registered' });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${process.env.BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/checkout/cancel`,
    metadata: { deviceId },
    customer_email: undefined,
  });

  return res.json({ url: session.url, sessionId: session.id });
});

// GET /checkout/success — user lands here after paying
router.get('/success', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).send('Missing session');

  // License key will have been issued by the webhook already
  // Poll /api/sms/status from the app — this page is just a confirmation
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>RideBeacon — Payment Successful</title>
      <style>
        body { font-family: -apple-system, sans-serif; background: #121212; color: #eee;
               display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { text-align: center; padding: 32px; }
        h1 { color: #FF6D00; font-size: 28px; }
        p { color: #9e9e9e; font-size: 16px; line-height: 1.6; }
        .check { font-size: 64px; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="check">✅</div>
        <h1>Payment successful!</h1>
        <p>Your RideBeacon license is now active for 1 year.<br>
           Return to the RideBeacon app on your Karoo —<br>
           your license is applied automatically.</p>
      </div>
    </body>
    </html>
  `);
});

router.get('/cancel', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>RideBeacon</title>
    <style>body{font-family:sans-serif;background:#121212;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
    .box{text-align:center;}.h1{color:#FF6D00;}</style></head>
    <body><div class="box"><h1 style="color:#FF6D00">Payment cancelled</h1>
    <p style="color:#9e9e9e">No charge was made. You can try again anytime.</p></div></body></html>
  `);
});

module.exports = router;
