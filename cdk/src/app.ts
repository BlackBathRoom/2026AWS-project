import * as cdk from 'aws-cdk-lib';
import { BackendStack } from './backend-stack';

const app = new cdk.App();
new BackendStack(app, 'Information2BackendStack', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION }
});