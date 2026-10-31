import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// One request at a time, 20 requests/day per user and organization, persisted across Lambdas.
// The lock expires after 120s if the user closes the page before polling completes.
export class TextbookAiQuota {
  constructor(private readonly tableName: string,
    private readonly client = DynamoDBDocumentClient.from(new DynamoDBClient({}))) {}

  private key(userId: string, organizationId: string, date: string) {
    return { pk: `TEXTBOOKAI#${organizationId}#${userId}`, sk: `DAY#${date}` };
  }

  async reserve(userId: string, organizationId: string, jobId: string, date: string, now: number): Promise<void> {
    await this.client.send(new UpdateCommand({
      TableName: this.tableName, Key: this.key(userId, organizationId, date),
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, activeJobId = :job, activeUntil = :until',
      ConditionExpression: '(attribute_not_exists(#count) OR #count < :limit) AND (attribute_not_exists(activeUntil) OR activeUntil <= :now)',
      ExpressionAttributeNames: { '#count': 'count' },
      ExpressionAttributeValues: { ':zero': 0, ':one': 1, ':limit': 20, ':job': jobId, ':until': now + 120000, ':now': now },
    }));
  }

  async release(userId: string, organizationId: string, jobId: string, date: string): Promise<void> {
    try {
      await this.client.send(new UpdateCommand({
        TableName: this.tableName, Key: this.key(userId, organizationId, date),
        UpdateExpression: 'REMOVE activeJobId, activeUntil',
        ConditionExpression: 'activeJobId = :job', ExpressionAttributeValues: { ':job': jobId },
      }));
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error;
    }
  }
}
