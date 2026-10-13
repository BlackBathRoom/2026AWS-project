import AWS from 'aws-sdk';
import { AuditEvent } from '../contracts/backend';

export interface AuditLogger { write(event: AuditEvent): Promise<void>; }

export class CloudWatchAuditLogger implements AuditLogger {
  private sequenceToken?: string;
  constructor(private readonly groupName: string, private readonly streamName: string, private readonly logs = new AWS.CloudWatchLogs()) {}

  async write(event: AuditEvent): Promise<void> {
    const result = await this.logs.putLogEvents({ logGroupName: this.groupName, logStreamName: this.streamName, sequenceToken: this.sequenceToken, logEvents: [{ message: JSON.stringify(event), timestamp: Date.parse(event.occurredAt) }] }).promise();
    this.sequenceToken = result.nextSequenceToken;
  }
}