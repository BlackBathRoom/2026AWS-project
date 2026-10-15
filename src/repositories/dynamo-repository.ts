import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { AuthContext } from '../contracts/user';
import { asOrganizationId, asTrainingId, asUserId } from '../contracts/common';
import { Role, roles } from '../contracts/common';

export interface DynamoRepositoryConfig { tableName: string; }

export class DynamoEntityRepository {
  constructor(private readonly client = DynamoDBDocumentClient.from(new DynamoDBClient({}))) {}

  async get<T>(config: DynamoRepositoryConfig, key: Record<string, unknown>): Promise<T | undefined> {
    const result = await this.client.send(new GetCommand({ TableName: config.tableName, Key: key, ConsistentRead: true }));
    return result.Item as T | undefined;
  }

  async getCurrentAuthContext(tableName: string, userId: string, tokenOrganizationId: string): Promise<AuthContext | undefined> {
    const [user, membership] = await Promise.all([
      this.get<Record<string, unknown>>({ tableName }, { pk: `USER#${userId}`, sk: 'PROFILE' }),
      this.get<Record<string, unknown>>({ tableName }, { pk: `USER#${userId}`, sk: `MEMBERSHIP#${tokenOrganizationId}` })
    ]);
    if (!user || !membership || user.status !== 'active' || membership.status !== 'active') return undefined;
    const startsAt = Date.parse(String(membership.startsAt));
    const endsAt = membership.endsAt ? Date.parse(String(membership.endsAt)) : undefined;
    if (!Number.isFinite(startsAt) || startsAt > Date.now() || (endsAt !== undefined && (!Number.isFinite(endsAt) || endsAt <= Date.now()))) return undefined;
    const organizationId = String(membership.organizationId || '');
    const role = String(user.role || '') as Role;
    const trainingIds = Array.isArray(membership.trainingIds) ? membership.trainingIds.filter((value): value is string => typeof value === 'string') : [];
    if (!organizationId || organizationId !== tokenOrganizationId || !roles.includes(role) || trainingIds.length === 0) return undefined;
    return { userId: asUserId(userId), organizationId: asOrganizationId(organizationId), role, trainingIds: trainingIds.map(asTrainingId), issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() };
  }

  async put<T extends Record<string, unknown>>(config: DynamoRepositoryConfig, item: T, conditionExpression?: string, expressionAttributeNames?: Record<string, string>, expressionAttributeValues?: Record<string, unknown>): Promise<void> {
    await this.client.send(new PutCommand({ TableName: config.tableName, Item: item, ConditionExpression: conditionExpression, ExpressionAttributeNames: expressionAttributeNames, ExpressionAttributeValues: expressionAttributeValues }));
  }

  async query<T>(config: DynamoRepositoryConfig, keyConditionExpression: string, expressionAttributeValues: Record<string, unknown>, indexName?: string, cursor?: string, limit = 50): Promise<{ items: T[]; nextCursor?: string }> {
    const exclusiveStartKey = cursor ? JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown> : undefined;
    const result = await this.client.send(new QueryCommand({ TableName: config.tableName, IndexName: indexName, KeyConditionExpression: keyConditionExpression, ExpressionAttributeValues: expressionAttributeValues, ConsistentRead: indexName ? undefined : true, ExclusiveStartKey: exclusiveStartKey, Limit: Math.min(Math.max(limit, 1), 100) }));
    const nextCursor = result.LastEvaluatedKey ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64url') : undefined;
    return { items: (result.Items || []) as T[], nextCursor };
  }

  async conditionalUpdate(config: DynamoRepositoryConfig, key: Record<string, unknown>, updateExpression: string, expressionAttributeValues: Record<string, unknown>, conditionExpression: string): Promise<void> {
    await this.client.send(new UpdateCommand({ TableName: config.tableName, Key: key, UpdateExpression: updateExpression, ConditionExpression: conditionExpression, ExpressionAttributeValues: expressionAttributeValues, ReturnValues: 'NONE' }));
  }

  async delete(config: DynamoRepositoryConfig, key: Record<string, unknown>, conditionExpression?: string): Promise<void> { await this.client.send(new DeleteCommand({ TableName: config.tableName, Key: key, ConditionExpression: conditionExpression })); }
}