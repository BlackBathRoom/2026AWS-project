import * as cdk from 'aws-cdk-lib';
import { aws_apigateway as apigateway, aws_cognito as cognito, aws_dynamodb as dynamodb, aws_iam as iam, aws_lambda as lambda, aws_lambda_nodejs as lambdaNodejs, aws_logs as logs, aws_s3 as s3 } from 'aws-cdk-lib';
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
    const api = new apigateway.RestApi(this, 'BackendApi', { deployOptions: { accessLogDestination: new apigateway.LogGroupLogDestination(logGroup), tracingEnabled: true }, endpointTypes: [apigateway.EndpointType.REGIONAL], defaultCorsPreflightOptions: { allowOrigins: [process.env.FRONTEND_ORIGIN || 'http://localhost:5173'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'] } });
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', { cognitoUserPools: [userPool] });
    const integration = new apigateway.LambdaIntegration(handler);
    api.root.addResource('health').addMethod('GET', integration);
    api.root.addProxy({ defaultIntegration: integration, defaultMethodOptions: { authorizer, authorizationType: apigateway.AuthorizationType.COGNITO } });
    new cdk.CfnOutput(this, 'ApiUrl', { value: api.url });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}