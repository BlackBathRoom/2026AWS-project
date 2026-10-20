import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway, aws_cognito as cognito, aws_dynamodb as dynamodb, aws_iam as iam, aws_lambda as lambda, aws_lambda_event_sources as lambdaEventSources, aws_lambda_nodejs as lambdaNodejs, aws_logs as logs, aws_s3 as s3, aws_sqs as sqs } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const userPool = new cognito.UserPool(this, 'UserPool', { selfSignUpEnabled: false, accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, customAttributes: { organizationId: new cognito.StringAttribute({ mutable: false }), role: new cognito.StringAttribute({ mutable: false }), trainingIds: new cognito.StringAttribute({ mutable: true }) }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const userPoolClient = userPool.addClient('ApiClient', { generateSecret: false, authFlows: { userSrp: true }, preventUserExistenceErrors: true, enableTokenRevocation: true, readAttributes: new cognito.ClientAttributes().withCustomAttributes('organizationId', 'role', 'trainingIds'), writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true }) });
    const table = new dynamodb.Table(this, 'BackendTable', { partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING }, billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const bucket = new s3.Bucket(this, 'PrivateUploads', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, versioned: true, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', { retention: logs.RetentionDays.ONE_YEAR, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const repositoryRoot = path.resolve(__dirname, '../..');
    const handler = new lambdaNodejs.NodejsFunction(this, 'BackendHandler', { runtime: lambda.Runtime.NODEJS_24_X, entry: path.join(repositoryRoot, 'src/lambda.ts'), projectRoot: repositoryRoot, depsLockFilePath: path.join(repositoryRoot, 'package-lock.json'), handler: 'handler', timeout: cdk.Duration.seconds(30), environment: { BACKEND_TABLE_NAME: table.tableName, UPLOAD_BUCKET_NAME: bucket.bucketName, COGNITO_REGION: this.region, COGNITO_USER_POOL_ID: userPool.userPoolId, COGNITO_AUDIENCE: userPoolClient.userPoolClientId } });
    table.grantReadWriteData(handler);
    bucket.grantReadWrite(handler);
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`] }));

    // --- 担当C領域: 教材限定RAG AIチューターの非同期処理基盤 (SQS FIFO + DLQ + Bedrock worker) ---
    // 仕様書 F-008/F-010/G-002〜G-005/G-008 に対応。B受付API→SQS→worker Lambda→Bedrock KBの流れ。
    const tutorDlq = new sqs.Queue(this, 'TutorJobsDlq', { fifo: true, contentBasedDeduplication: false, retentionPeriod: cdk.Duration.days(14), enforceSSL: true, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const tutorQueue = new sqs.Queue(this, 'TutorJobsQueue', { fifo: true, contentBasedDeduplication: false, enforceSSL: true, visibilityTimeout: cdk.Duration.seconds(120), deadLetterQueue: { queue: tutorDlq, maxReceiveCount: 3 }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const aiAuditLogGroup = new logs.LogGroup(this, 'AiAuditLogGroup', { retention: logs.RetentionDays.ONE_YEAR, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const aiAuditLogStream = 'tutor-worker';

    // Bedrock の Knowledge Base ID とモデル ID はデプロイ環境ごとに注入する (承認済み教材KBは担当Cが別途作成)。
    const knowledgeBaseId = process.env.BEDROCK_KNOWLEDGE_BASE_ID || 'REPLACE_WITH_KNOWLEDGE_BASE_ID';
    const bedrockModelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0';

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
        BACKEND_TABLE_NAME: table.tableName,
        BEDROCK_KNOWLEDGE_BASE_ID: knowledgeBaseId,
        BEDROCK_MODEL_ID: bedrockModelId,
        AI_AUDIT_LOG_GROUP: aiAuditLogGroup.logGroupName,
        AI_AUDIT_LOG_STREAM: aiAuditLogStream,
      },
    });
    table.grantReadWriteData(aiWorker);
    tutorQueue.grantConsumeMessages(aiWorker);
    aiWorker.addEventSource(new lambdaEventSources.SqsEventSource(tutorQueue, { batchSize: 1, reportBatchItemFailures: true }));
    aiAuditLogGroup.grantWrite(aiWorker);
    aiWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['logs:CreateLogStream', 'logs:PutLogEvents'], resources: [aiAuditLogGroup.logGroupArn, `${aiAuditLogGroup.logGroupArn}:*`] }));
    // Bedrock KB 検索 (G-001: 承認済みKB限定) とモデル呼び出し。リソースは実KB/モデルARNに絞ること。
    aiWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:Retrieve'], resources: [`arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${knowledgeBaseId}`] }));
    aiWorker.addToRolePolicy(new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: [`arn:aws:bedrock:${this.region}::foundation-model/${bedrockModelId}`, `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${bedrockModelId}`] }));

    // 受付 API Lambda(B) はジョブを SQS へ投入する権限が必要。
    tutorQueue.grantSendMessages(handler);
    handler.addEnvironment('TUTOR_QUEUE_URL', tutorQueue.queueUrl);

    const api = new apigateway.RestApi(this, 'BackendApi', { deployOptions: { accessLogDestination: new apigateway.LogGroupLogDestination(logGroup), tracingEnabled: true }, endpointTypes: [apigateway.EndpointType.REGIONAL], defaultCorsPreflightOptions: { allowOrigins: [process.env.FRONTEND_ORIGIN || 'http://localhost:5173'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'] } });
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', { cognitoUserPools: [userPool] });
    const integration = new apigateway.LambdaIntegration(handler);
    api.root.addResource('health').addMethod('GET', integration);
    api.root.addProxy({ defaultIntegration: integration, defaultMethodOptions: { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO } });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'TutorQueueUrl', { value: tutorQueue.queueUrl });
    new cdk.CfnOutput(this, 'TutorDlqUrl', { value: tutorDlq.queueUrl });
    new cdk.CfnOutput(this, 'AiWorkerName', { value: aiWorker.functionName });
    new cdk.CfnOutput(this, 'AiAuditLogGroupName', { value: aiAuditLogGroup.logGroupName });
  }
}