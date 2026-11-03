import { fromLoginCredentials } from '@aws-sdk/credential-providers';

// AWS Lambda uses its IAM role. Explicit opt-in supports the tested local AWS
// CLI login flow without putting credentials into source or deployment settings.
export function bedrockClientConfig(env: NodeJS.ProcessEnv = process.env) {
  const region = env.AWS_REGION || 'us-east-1';
  return {
    region,
    maxAttempts: 1,
    ...(env.AWS_USE_LOGIN_CREDENTIALS === 'true' ? {
      credentials: fromLoginCredentials({ profile: env.AWS_PROFILE || 'default', clientConfig: { region } }),
    } : {}),
  };
}
