require('dotenv').config();
const express = require('express');
const db = require('./db');
const realtime = require('./services/realtime');

const app = express();

// Stripe webhook needs raw body — must be before express.json()
app.use('/webhook', require('./routes/webhook'));

app.use(express.json());
app.use(express.urlencoded({ extended: false })); // for the setup page's HTML forms

app.use('/webhook/telegram', require('./routes/telegram'));
app.use('/setup', require('./routes/setup'));
app.use('/api/device', require('./routes/notify'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/checkout', require('./routes/checkout'));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '3.0.0' }));

const PORT = process.env.PORT || 3000;

Promise.all([db.init(), realtime.initRealtime()]).then(() => {
  app.listen(PORT, () => console.log(`RideBeacon backend running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init database or realtime listener:', err);
  process.exit(1);
});
