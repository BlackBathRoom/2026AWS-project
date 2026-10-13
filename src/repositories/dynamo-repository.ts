import AWS from 'aws-sdk';

export interface DynamoRepositoryConfig { tableName: string; }

export class DynamoEntityRepository {
  constructor(private readonly client = new AWS.DynamoDB.DocumentClient()) {}

  async get<T>(config: DynamoRepositoryConfig, key: Record<string, unknown>): Promise<T | undefined> {
    const result = await this.client.get({ TableName: config.tableName, Key: key, ConsistentRead: true }).promise();
    return result.Item as T | undefined;
  }

  async put<T extends Record<string, unknown>>(config: DynamoRepositoryConfig, item: T, conditionExpression?: string, expressionAttributeNames?: Record<string, string>, expressionAttributeValues?: Record<string, unknown>): Promise<void> {
    await this.client.put({ TableName: config.tableName, Item: item, ConditionExpression: conditionExpression, ExpressionAttributeNames: expressionAttributeNames, ExpressionAttributeValues: expressionAttributeValues }).promise();
  }

  async query<T>(config: DynamoRepositoryConfig, keyConditionExpression: string, expressionAttributeValues: Record<string, unknown>, indexName?: string): Promise<T[]> {
    const result = await this.client.query({ TableName: config.tableName, IndexName: indexName, KeyConditionExpression: keyConditionExpression, ExpressionAttributeValues: expressionAttributeValues, ConsistentRead: indexName ? undefined : true }).promise();
    return (result.Items || []) as T[];
  }

  async conditionalUpdate(config: DynamoRepositoryConfig, key: Record<string, unknown>, updateExpression: string, expressionAttributeValues: Record<string, unknown>, conditionExpression: string): Promise<void> {
    await this.client.update({ TableName: config.tableName, Key: key, UpdateExpression: updateExpression, ConditionExpression: conditionExpression, ExpressionAttributeValues: expressionAttributeValues, ReturnValues: 'NONE' }).promise();
  }

  async delete(config: DynamoRepositoryConfig, key: Record<string, unknown>, conditionExpression?: string): Promise<void> { await this.client.delete({ TableName: config.tableName, Key: key, ConditionExpression: conditionExpression }).promise(); }
}