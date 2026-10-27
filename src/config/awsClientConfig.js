const {
  fromLoginCredentials,
} = require('@aws-sdk/credential-providers');

function createAwsClientConfig() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const config = { region };

  if (process.env.AWS_USE_LOGIN_CREDENTIALS === 'true') {
    config.credentials = fromLoginCredentials({
      profile: process.env.AWS_PROFILE || 'default',
      clientConfig: {
        region,
      },
    });
  }

  return config;
}

module.exports = { createAwsClientConfig };
