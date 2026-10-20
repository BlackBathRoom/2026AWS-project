import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway, aws_cognito as cognito, aws_dynamodb as dynamodb, aws_iam as iam, aws_lambda as lambda, aws_lambda_nodejs as lambdaNodejs, aws_logs as logs, aws_s3 as s3 } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'node:path';

// 担当B領域のスタック: Cognito / API Gateway / Lambda(受付API) / DynamoDB / S3 / CloudWatch Logs。
// 担当C領域(SQS/DLQ/AI worker/Bedrock)は TutorAiStack に分離してある。
// TutorAiStack がクロススタックで参照できるよう、table と handler を公開する。
export class BackendStack extends cdk.Stack {
  // SQS FIFO キューの決定論的な基底名。TutorAiStack が同じ名前でキューを作る。
  // ".fifo" を除いた基底名。実キュー名は `${TUTOR_QUEUE_BASE_NAME}.fifo`。
  public static readonly TUTOR_QUEUE_BASE_NAME = 'information2-tutor-jobs';

  public readonly table: dynamodb.Table;
  public readonly handler: lambdaNodejs.NodejsFunction;
  public readonly repositoryRoot: string;

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

    // 受付API(B)はAIチューターのジョブを SQS(担当Cスタックが作成) へ投入する。
    // 循環依存を避けるため、C構造体ではなく名前ベースのARN/URLで権限と環境変数を付与する。
    // TutorAiStack 未デプロイ時は TUTOR_QUEUE_URL 未設定と同等に扱えるよう、ローカルは
    // 既存インメモリ挙動へフォールバックする (src/integrations/tutor-provider-factory.ts)。
    const tutorQueueName = `${BackendStack.TUTOR_QUEUE_BASE_NAME}.fifo`;
    const tutorQueueArn = `arn:aws:sqs:${this.region}:${this.account}:${tutorQueueName}`;
    handler.addToRolePolicy(new iam.PolicyStatement({ actions: ['sqs:SendMessage', 'sqs:GetQueueUrl'], resources: [tutorQueueArn] }));
    handler.addEnvironment('TUTOR_QUEUE_URL', `https://sqs.${this.region}.amazonaws.com/${this.account}/${tutorQueueName}`);

    const api = new apigateway.RestApi(this, 'BackendApi', { deployOptions: { accessLogDestination: new apigateway.LogGroupLogDestination(logGroup), tracingEnabled: true }, endpointTypes: [apigateway.EndpointType.REGIONAL], defaultCorsPreflightOptions: { allowOrigins: [process.env.FRONTEND_ORIGIN || 'http://localhost:5173'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'] } });
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', { cognitoUserPools: [userPool] });
    const integration = new apigateway.LambdaIntegration(handler);
    api.root.addResource('health').addMethod('GET', integration);
    api.root.addProxy({ defaultIntegration: integration, defaultMethodOptions: { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO } });

    this.table = table;
    this.handler = handler;
    this.repositoryRoot = repositoryRoot;

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
