#!/usr/bin/env node
// AWS SNS SMS sandbox helper. While the SNS account is in sandbox mode, SMS
// can only be delivered to verified numbers. Usage (env needs AWS_ACCESS_KEY_ID,
// AWS_SECRET_ACCESS_KEY, AWS_REGION):
//
//   node scripts/sms-sandbox.js status
//   node scripts/sms-sandbox.js add +41791234567     # sends an OTP via SMS
//   node scripts/sms-sandbox.js verify +41791234567 123456
//   node scripts/sms-sandbox.js send +41791234567 "Test from RideBeacon"

const {
  SNSClient,
  GetSMSSandboxAccountStatusCommand,
  ListSMSSandboxPhoneNumbersCommand,
  CreateSMSSandboxPhoneNumberCommand,
  VerifySMSSandboxPhoneNumberCommand,
} = require('@aws-sdk/client-sns');
const sms = require('../src/services/channels/sms');

const client = new SNSClient({ region: process.env.AWS_REGION || 'eu-north-1' });
const [cmd, phone, arg] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case 'status': {
      const s = await client.send(new GetSMSSandboxAccountStatusCommand({}));
      const list = await client.send(new ListSMSSandboxPhoneNumbersCommand({}));
      console.log(`Sandbox: ${s.IsInSandbox}`);
      console.log('Verified numbers:', list.PhoneNumbers.map(p => `${p.PhoneNumber} (${p.Status})`).join(', ') || '(none)');
      break;
    }
    case 'add':
      await client.send(new CreateSMSSandboxPhoneNumberCommand({ PhoneNumber: phone, LanguageCode: 'en-US' }));
      console.log(`OTP sent to ${phone}. Next: node scripts/sms-sandbox.js verify ${phone} <otp>`);
      break;
    case 'verify':
      await client.send(new VerifySMSSandboxPhoneNumberCommand({ PhoneNumber: phone, OneTimePassword: arg }));
      console.log(`${phone} verified — SMS to this number will now be delivered.`);
      break;
    case 'send': {
      const id = await sms.send(phone, arg || 'Test from RideBeacon');
      console.log(`Sent, MessageId: ${id}`);
      break;
    }
    default:
      console.log('Usage: sms-sandbox.js status | add <phone> | verify <phone> <otp> | send <phone> <msg>');
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
