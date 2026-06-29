require('dotenv').config();
const express = require('express');
const db = require('./db');

const app = express();

// Stripe webhook needs raw body — must be before express.json()
app.use('/webhook', require('./routes/webhook'));

app.use(express.json());

app.use('/api/sms', require('./routes/sms'));
app.use('/api/checkout', require('./routes/checkout'));
app.use('/checkout', require('./routes/checkout'));

app.get('/health', (req, res) => res.json({ status: 'ok', version: '2.0.0' }));

const PORT = process.env.PORT || 3000;

db.init().then(() => {
  app.listen(PORT, () => console.log(`RideBeacon backend running on port ${PORT}`));
}).catch(err => {
  console.error('Failed to init database:', err);
  process.exit(1);
});
