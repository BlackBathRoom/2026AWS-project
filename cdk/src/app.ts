import * as cdk from 'aws-cdk-lib';
import { BackendStack } from './backend-stack';
import { TutorAiStack } from './tutor-ai-stack';

const app = new cdk.App();

// リージョンは us-east-1 固定。アカウントは実行環境の認証情報から解決する。
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: 'us-east-1' };

// 担当B領域。これ単独で `cdk deploy Information2BackendStack` によりデプロイできる。
const backend = new BackendStack(app, 'Information2BackendStack', { env });

// 担当C領域(SQS/DLQ/AI worker/Bedrock)。B のテーブルと受付Lambdaを参照する。
// 担当Cがデプロイする場合のみ `cdk deploy Information2TutorAiStack` で追加される。
new TutorAiStack(app, 'Information2TutorAiStack', {
  env,
  backendTable: backend.table,
  repositoryRoot: backend.repositoryRoot,
});
