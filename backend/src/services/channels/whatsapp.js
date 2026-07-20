const GRAPH_API_VERSION = 'v25.0';
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME; // must be pre-approved in Meta Business Manager
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US';

const API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;

// Business-initiated WhatsApp messages MUST use a pre-approved template —
// you cannot send arbitrary free text unless the user messaged you first
// within the last 24h. The template should have one body variable for the
// ride-notification text, e.g.:
//   Template "ride_notification": "{{1}}"
// The verified WhatsApp Business display name ("RideBeacon") is what shows
// as the sender — configured once in Meta Business Manager, not per-message.
//
// WHATSAPP_FREETEXT=1 switches to plain-text sends instead. Only works
// inside the 24h customer-service window (recipient messaged us first) —
// meant for testing while the template is still pending approval.
async function send(identifier, message) {
  const payload = process.env.WHATSAPP_FREETEXT === '1'
    ? { type: 'text', text: { body: message } }
    : {
        type: 'template',
        template: {
          name: TEMPLATE_NAME,
          language: { code: TEMPLATE_LANG },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: message }],
            },
          ],
        },
      };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: identifier, // E.164 phone number, no leading +
      ...payload,
    }),
  });

  const data = await res.json();
  if (data.error) {
    throw new Error(`WhatsApp send failed: ${data.error.message}`);
  }
  return data.messages?.[0]?.id;
}

module.exports = { send };
