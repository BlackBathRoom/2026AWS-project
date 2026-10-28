import { CloudWatchLogsClient, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { AuditEvent } from '../contracts/backend';

export interface AuditLogger { write(event: AuditEvent): Promise<void>; }

export class CloudWatchAuditLogger implements AuditLogger {
  private sequenceToken?: string;
  constructor(private readonly groupName: string, private readonly streamName: string, private readonly logs = new CloudWatchLogsClient({})) {}

  async write(event: AuditEvent): Promise<void> {
    const result = await this.logs.send(new PutLogEventsCommand({ logGroupName: this.groupName, logStreamName: this.streamName, sequenceToken: this.sequenceToken, logEvents: [{ message: JSON.stringify(event), timestamp: Date.parse(event.occurredAt) }] }));
    this.sequenceToken = result.nextSequenceToken;
  }
}