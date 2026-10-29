import * as cdk from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb, aws_iam as iam, aws_lambda as lambda, aws_lambda_event_sources as lambdaEventSources, aws_lambda_nodejs as lambdaNodejs, aws_logs as logs, aws_sqs as sqs } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';
import { BackendStack } from './backend-stack';

// 担当C領域のスタック: 教材限定RAG AIチューターの非同期処理基盤。
// 仕様書 F-008/F-010/G-002〜G-005/G-008 に対応。B受付API→SQS→worker Lambda→Bedrock KBの流れ。
//
// BackendStack(担当B) の DynamoDB テーブルと受付 Lambda をクロススタックで受け取り、
// SQS送信権限と TUTOR_QUEUE_URL を B 側 handler へ付与する。これにより担当Bは
// BackendStack 単独でデプロイでき、C領域は本スタックのデプロイ時にのみ追加される。
export interface TutorAiStackProps extends cdk.StackProps {
  /** 担当Bの DynamoDB テーブル。ジョブ状態の永続化に使う。 */
  readonly backendTable: dynamodb.Table;
  /** Lambda バンドルのプロジェクトルート (リポジトリ直下)。 */
  readonly repositoryRoot: string;
}

export class TutorAiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TutorAiStackProps) {
    super(scope, id, props);

    const { backendTable, repositoryRoot } = props;

    // キュー名は BackendStack と共有する決定論的な名前にする。
    // こうすることで BackendStack 側が TutorAiStack の構造体を参照せずに
    // (名前ベースARNで) 送信権限・環境変数を持て、スタック間の循環依存を避けられる。
    const tutorDlq = new sqs.Queue(this, 'TutorJobsDlq', { queueName: `${BackendStack.TUTOR_QUEUE_BASE_NAME}-dlq.fifo`, fifo: true, contentBasedDeduplication: false, retentionPeriod: cdk.Duration.days(14), enforceSSL: true, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const tutorQueue = new sqs.Queue(this, 'TutorJobsQueue', { queueName: `${BackendStack.TUTOR_QUEUE_BASE_NAME}.fifo`, fifo: true, contentBasedDeduplication: false, enforceSSL: true, visibilityTimeout: cdk.Duration.seconds(120), deadLetterQueue: { queue: tutorDlq, maxReceiveCount: 3 }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const aiAuditLogGroup = new logs.LogGroup(this, 'AiAuditLogGroup', { retention: logs.RetentionDays.ONE_YEAR, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const aiAuditLogStream = 'tutor-worker';

    // Bedrock の Knowledge Base ID とモデル ID はデプロイ環境ごとに注入する (承認済み教材KBは担当Cが別途作成)。
    const knowledgeBaseId = new cdk.CfnParameter(this, 'KnowledgeBaseId', {
      type: 'String', allowedPattern: '[A-Za-z0-9]{10}',
      description: 'Existing us-east-1 Knowledge Base containing only the approved textbook dataset.',
    }).valueAsString;
    const bedrockModelId = new cdk.CfnParameter(this, 'ModelId', {
      type: 'String', minLength: 1, description: 'Converse-compatible model ID or inference profile ARN.',
    }).valueAsString;
    const modelInvokeArns = new cdk.CfnParameter(this, 'ModelInvokeArns', {
      type: 'CommaDelimitedList',
      description: 'Exact model/profile ARNs; for cross-region profiles include destination foundation-model ARNs.',
    }).valueAsList;

    const aiWorker = new lambdaNodejs.NodejsFunction(this, 'TutorWorker', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(repositoryRoot, 'src/ai-worker.ts'),
      projectRoot: repositoryRoot,
      depsLockFilePath: path.join(repositoryRoot, 'package-lock.json'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      reservedConcurrentExecutions: 5,
      environment: {
        BACKEND_TABLE_NAME: backendTable.tableName,
        BEDROCK_KNOWLEDGE_BASE_ID: knowledgeBaseId,
        BEDROCK_MODEL_ID: bedrockModelId,
        AI_AUDIT_LOG_GROUP: aiAuditLogGroup.logGroupName,
        AI_AUDIT_LOG_STREAM: aiAuditLogStream,
      },
    });
    backendTable.grantReadWriteData(aiWorker);
    tutorQueue.grantConsumeMessages(aiWorker);
    aiWorker.addEventSource(new lambdaEventSources.SqsEventSource(tutorQueue, { batchSize: 1, reportBatchItemFailures: true }));
    aiAuditLogGroup.grantWrite(aiWorker);
    aiWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [aiAuditLogGroup.logGroupArn, `${aiAuditLogGroup.logGroupArn}:*`] }));
    // Bedrock KB 検索 (G-001: 承認済みKB限定) とモデル呼び出し。リソースは実KB/モデルARNに絞ること。
    aiWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:Retrieve'], resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${knowledgeBaseId}`] }));
    aiWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: modelInvokeArns }));

    // 受付 API Lambda(B) への SQS 送信権限と TUTOR_QUEUE_URL は、循環依存を避けるため
    // BackendStack 側で名前ベースARN/URLを使って付与済み (BackendStack.TUTOR_QUEUE_BASE_NAME)。

    new cdk.CfnOutput(this, 'TutorQueueUrl', { value: tutorQueue.queueUrl });
    new cdk.CfnOutput(this, 'TutorDlqUrl', { value: tutorDlq.queueUrl });
    new cdk.CfnOutput(this, 'AiWorkerName', { value: aiWorker.functionName });
    new cdk.CfnOutput(this, 'AiAuditLogGroupName', { value: aiAuditLogGroup.logGroupName });
  }
}
