import { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { AuditEvent } from '../contracts/backend';

export interface AuditLogger { write(event: AuditEvent): Promise<void>; }

export class CloudWatchAuditLogger implements AuditLogger {
  private sequenceToken?: string;
  private streamReady = false;
  constructor(private readonly groupName: string, private readonly streamName: string, private readonly logs = new CloudWatchLogsClient({})) {}

  async write(event: AuditEvent): Promise<void> {
    if (!this.streamReady) {
      try {
        await this.logs.send(new CreateLogStreamCommand({ logGroupName: this.groupName, logStreamName: this.streamName }));
      } catch (error) {
        if ((error as { name?: string }).name !== 'ResourceAlreadyExistsException') throw error;
      }
      this.streamReady = true;
    }
    const result = await this.logs.send(new PutLogEventsCommand({ logGroupName: this.groupName, logStreamName: this.streamName, sequenceToken: this.sequenceToken, logEvents: [{ message: JSON.stringify(event), timestamp: Date.parse(event.occurredAt) }] }));
    this.sequenceToken = result.nextSequenceToken;
  }
}