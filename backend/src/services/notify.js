const sms = require('./channels/sms');
const telegram = require('./channels/telegram');
const whatsapp = require('./channels/whatsapp');

const CHANNELS = { sms, telegram, whatsapp };

const IDENTIFIER_COLUMN = {
  sms: 'phone_number',
  telegram: 'telegram_chat_id',
  whatsapp: 'whatsapp_number',
};

function getIdentifier(device, channel) {
  return device[IDENTIFIER_COLUMN[channel]];
}

// Sends `message` to `device` over `channel`, resolving the right delivery
// identifier from the device record. Throws if the channel isn't linked yet.
async function send(device, channel, message) {
  const impl = CHANNELS[channel];
  if (!impl) throw new Error(`Unsupported channel: ${channel}`);

  const identifier = getIdentifier(device, channel);
  if (!identifier) {
    throw new Error(`Device has not linked channel "${channel}" yet`);
  }

  return impl.send(identifier, message);
}

module.exports = { send, getIdentifier, CHANNELS: Object.keys(CHANNELS) };
