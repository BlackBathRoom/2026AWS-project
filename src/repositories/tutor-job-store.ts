// AIチューターのジョブ状態を永続化する。worker(src/ai-worker.ts) が書き込み、
// B側API(GET /tutor/jobs/:id) が読み出す。所有者(userId/organizationId)境界を保つ。

import { TutorJob, TutorResult } from '../contracts/backend';
import { DynamoEntityRepository, DynamoRepositoryConfig } from './dynamo-repository';

export interface TutorJobStore {
  create(job: TutorJob): Promise<void>;
  markRunning(jobId: string): Promise<void>;
  complete(jobId: string, result: TutorResult): Promise<void>;
  fail(jobId: string, result: TutorResult): Promise<void>;
  get(jobId: string, owner: { userId: string; organizationId: string }): Promise<TutorJob | undefined>;
}

interface StoredJob extends TutorJob {
  pk: string;
  sk: string;
  updatedAt: string;
}

function keyFor(jobId: string): { pk: string; sk: string } {
  return { pk: `TUTORJOB#${jobId}`, sk: 'STATE' };
}

/** 本番用 DynamoDB 実装。既存 BackendTable の pk/sk を流用する。 */
export class DynamoTutorJobStore implements TutorJobStore {
  private readonly config: DynamoRepositoryConfig;
  constructor(tableName: string, private readonly repo = new DynamoEntityRepository()) {
    this.config = { tableName };
  }

  async create(job: TutorJob): Promise<void> {
    const item: StoredJob = { ...job, ...keyFor(job.jobId), updatedAt: new Date().toISOString() };
    await this.repo.put(this.config, item as unknown as Record<string, unknown>, 'attribute_not_exists(pk)');
  }

  async markRunning(jobId: string): Promise<void> {
    await this.repo.conditionalUpdate(
      this.config,
      keyFor(jobId),
      'SET #status = :running, updatedAt = :now',
      { ':running': 'RUNNING', ':now': new Date().toISOString(), ':queued': 'QUEUED' },
      '#status = :queued',
      { '#status': 'status' },
    ).catch(() => undefined);
  }

  async complete(jobId: string, result: TutorResult): Promise<void> {
    await this.repo.conditionalUpdate(
      this.config,
      keyFor(jobId),
      'SET #status = :completed, #result = :result, updatedAt = :now',
      { ':completed': 'COMPLETED', ':result': result, ':now': new Date().toISOString() },
      'attribute_exists(pk)',
      { '#status': 'status', '#result': 'result' },
    );
  }

  async fail(jobId: string, result: TutorResult): Promise<void> {
    await this.repo.conditionalUpdate(
      this.config,
      keyFor(jobId),
      'SET #status = :failed, #result = :result, updatedAt = :now',
      { ':failed': 'FAILED', ':result': result, ':now': new Date().toISOString() },
      'attribute_exists(pk)',
      { '#status': 'status', '#result': 'result' },
    );
  }

  async get(jobId: string, owner: { userId: string; organizationId: string }): Promise<TutorJob | undefined> {
    const item = await this.repo.get<StoredJob>(this.config, keyFor(jobId));
    if (!item || item.userId !== owner.userId || item.organizationId !== owner.organizationId) return undefined;
    return { jobId: item.jobId, userId: item.userId, organizationId: item.organizationId, status: item.status, result: item.result };
  }
}

/** テスト・ローカル用のインメモリ実装。 */
export class InMemoryTutorJobStore implements TutorJobStore {
  private readonly jobs = new Map<string, TutorJob>();

  async create(job: TutorJob): Promise<void> {
    this.jobs.set(job.jobId, { ...job });
  }
  async markRunning(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'QUEUED') job.status = 'RUNNING';
  }
  async complete(jobId: string, result: TutorResult): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) { job.status = 'COMPLETED'; job.result = result; }
  }
  async fail(jobId: string, result: TutorResult): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job) { job.status = 'FAILED'; job.result = result; }
  }
  async get(jobId: string, owner: { userId: string; organizationId: string }): Promise<TutorJob | undefined> {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== owner.userId || job.organizationId !== owner.organizationId) return undefined;
    return { ...job };
  }
}
