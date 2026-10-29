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

    // The deployed frontend and its OAuth callback share this production origin.
    const frontendOrigin = 'https://bittomo.click';
    const frontendUrl = `${frontendOrigin}/`;

    const textbookAiEnabled = new cdk.CfnParameter(this, 'TextbookAiEnabled', {
      type: 'String', default: 'false', allowedValues: ['true', 'false'],
      description: 'Enable only after the textbook Knowledge Base and AI worker pass a live test.',
    });
    const userPool = new cognito.UserPool(this, 'UserPool', { selfSignUpEnabled: false, accountRecovery: cognito.AccountRecovery.EMAIL_ONLY, customAttributes: { organizationId: new cognito.StringAttribute({ mutable: false }), role: new cognito.StringAttribute({ mutable: false }), trainingIds: new cognito.StringAttribute({ mutable: true }) }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    // Preserve construct IDs so the existing pool and client keep their logical IDs.
    const userPoolClient = userPool.addClient('ApiClient', {
      generateSecret: false,
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false, clientCredentials: false },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: [frontendUrl],
        defaultRedirectUri: frontendUrl,
        logoutUrls: [frontendUrl],
      },
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({ email: true, emailVerified: true })
        .withCustomAttributes('organizationId', 'role', 'trainingIds'),
      writeAttributes: new cognito.ClientAttributes().withStandardAttributes({ email: true }),
    });
    // bittomo-login.auth.us-east-1.amazoncognito.com and its managed-login style
    // already exist outside this template. Keep them intact; adopt them via a
    // separate CloudFormation resource import rather than creating duplicates.

    const table = new dynamodb.Table(this, 'BackendTable', { partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING }, sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING }, billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true }, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const bucket = new s3.Bucket(this, 'PrivateUploads', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, encryption: s3.BucketEncryption.S3_MANAGED, enforceSSL: true, versioned: true, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const logGroup = new logs.LogGroup(this, 'ApiLogGroup', { retention: logs.RetentionDays.ONE_YEAR, removalPolicy: cdk.RemovalPolicy.RETAIN });
    const repositoryRoot = path.resolve(__dirname, '../..');
    const handler = new lambdaNodejs.NodejsFunction(this, 'BackendHandler', { runtime: lambda.Runtime.NODEJS_24_X, entry: path.join(repositoryRoot, 'src/lambda.ts'), projectRoot: repositoryRoot, depsLockFilePath: path.join(repositoryRoot, 'package-lock.json'), handler: 'handler', timeout: cdk.Duration.seconds(30), environment: { NODE_ENV: 'production', FRONTEND_ORIGIN: frontendOrigin, MATERIALS_BUCKET_NAME: 'info2-materials-432410731458-us-east-1-an', MATERIALS_REGION: 'us-east-1', MATERIALS_ENTITLEMENTS_JSON: JSON.stringify({ 'school-001': ['training-001'] }), TEXTBOOK_AI_ENABLED: textbookAiEnabled.valueAsString, BACKEND_TABLE_NAME: table.tableName, UPLOAD_BUCKET_NAME: bucket.bucketName, COGNITO_REGION: this.region, COGNITO_USER_POOL_ID: userPool.userPoolId, COGNITO_AUDIENCE: userPoolClient.userPoolClientId } });
    // Existing private textbook bucket; allow only the seven registered PDF keys.
    handler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['00_cover.pdf','01_chapter1.pdf','02_chapter2.pdf',
        '03_chapter3_part1.pdf','03_chapter3_part2.pdf','04_chapter4.pdf','05_chapter5.pdf']
        .map(filename => `arn:aws:s3:::info2-materials-432410731458-us-east-1-an/materials/info2/${filename}`),
    }));
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

    const api = new apigateway.RestApi(this, 'BackendApi', { deployOptions: { accessLogDestination: new apigateway.LogGroupLogDestination(logGroup), tracingEnabled: true }, endpointTypes: [apigateway.EndpointType.REGIONAL], defaultCorsPreflightOptions: { allowOrigins: [frontendOrigin], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'] } });
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', { cognitoUserPools: [userPool] });
    const integration = new apigateway.LambdaIntegration(handler);
    api.root.addResource('health').addMethod('GET', integration);
    // Apply authorization to ANY only. OPTIONS must not inherit OAuth scopes.
    const proxy = api.root.addProxy({ defaultIntegration: integration, anyMethod: false });
    proxy.addMethod('ANY', integration, {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
      authorizationScopes: ['openid'],
    });

    // Gateway-generated failures also need CORS; proxy responses use app.ts.
    for (const [responseId, type] of [
      ['CorsDefault4xx', apigateway.ResponseType.DEFAULT_4XX],
      ['CorsDefault5xx', apigateway.ResponseType.DEFAULT_5XX],
    ] as const) {
      api.addGatewayResponse(responseId, {
        type,
        responseHeaders: {
          'Access-Control-Allow-Origin': `'${frontendOrigin}'`,
          'Access-Control-Allow-Headers': "'Authorization,Content-Type,Idempotency-Key,X-Request-Id'",
          'Access-Control-Allow-Methods': "'GET,POST,PUT,PATCH,DELETE,OPTIONS'",
        },
      });
    }

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
