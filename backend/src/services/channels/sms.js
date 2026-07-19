const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const client = new SNSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// NOTE: Alphanumeric Sender ID ("RideBeacon") is not supported by carriers in
// the US and Canada — SNS will silently fall back to a generic long code
// there. Everywhere else it should display as "RideBeacon".
async function send(identifier, message) {
  const command = new PublishCommand({
    PhoneNumber: identifier, // E.164 phone number
    Message: message,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
      'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'RideBeacon' },
    },
  });
  const response = await client.send(command);
  return response.MessageId;
}

module.exports = { send };
