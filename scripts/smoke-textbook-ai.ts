// Explicit opt-in: four live requests can invoke Bedrock and incur AWS charges.
// --queue additionally creates four synthetic jobs and dispatches them through
// the deployed SQS worker. It does not change real user profiles or enable AI.
import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SQSClient } from '@aws-sdk/client-sqs';
import { BedrockRagTutor, bedrockConfigFromEnv } from '../src/integrations/bedrock-ai-provider';
import { bedrockClientConfig } from '../src/integrations/bedrock-client-config';
import { SqsAiTutorProvider } from '../src/integrations/aws-ai-provider';
import { DynamoEntityRepository } from '../src/repositories/dynamo-repository';
import { DynamoTutorJobStore } from '../src/repositories/tutor-job-store';
import type { TutorResult } from '../src/contracts/backend';
import type { InternalStudyContext } from '../src/contracts/study-context';
import { asAssignmentId, asOrganizationId, asRuleVersionId, asTrainingId, asUserId } from '../src/contracts/common';

const cases = [
  { question: '決定木とはどのようなものですか？', expected: 'SUPPORTED' },
  { question: '情報システムとはどのようなものですか？', expected: 'SUPPORTED' },
  { question: '今日の京都の天気を教えてください。', expected: 'OUT_OF_SCOPE' },
  { question: 'おすすめのラーメン屋を教えてください。', expected: 'OUT_OF_SCOPE' },
];
async function main() {
  if (!process.argv.includes('--live')) {
    console.log('プレビューのみ。AWS呼出なし。実機テストは --live、SQS workerも含める場合は --live --queue を指定してください。');
    console.log(JSON.stringify(cases, null, 2)); return;
  }
  const run = randomUUID();
  const context: InternalStudyContext = {
    userId: asUserId(`smoke-${run}`), organizationId: asOrganizationId('smoke-textbook-ai'),
    trainingId: asTrainingId('smoke-training'), assignmentId: asAssignmentId('textbook-smoke'),
    mode: 'learning', assistancePolicy: 'guided', ruleVersionId: asRuleVersionId('textbook-rule-v1'),
    purpose: 'learning', conceptIds: [], allowAnswer: false, policyVersion: 'textbook-policy-v1',
  };
  const clients = bedrockClientConfig();
  let answer: (question: string) => Promise<TutorResult>;
  let close = () => {};
  if (process.argv.includes('--queue')) {
    const table = process.env.BACKEND_TABLE_NAME, queue = process.env.TUTOR_QUEUE_URL;
    if (!table || !queue) throw new Error('BACKEND_TABLE_NAME and TUTOR_QUEUE_URL are required for --queue');
    const ddb = DynamoDBDocumentClient.from(new DynamoDBClient(clients), { marshallOptions: { removeUndefinedValues: true } });
    const sqs = new SQSClient(clients);
    const store = new DynamoTutorJobStore(table, new DynamoEntityRepository(ddb));
    const provider = new SqsAiTutorProvider(queue, store, sqs);
    close = () => { ddb.destroy(); sqs.destroy(); };
    answer = async question => {
      const { jobId } = await provider.enqueue({ jobId: `job-smoke-${randomUUID()}`, userId: context.userId,
        question, requestedAction: 'explanation', context });
      console.log(JSON.stringify({ jobId, question }));
      const until = Date.now() + 120000;
      while (Date.now() < until) {
        const job = await provider.getJob(jobId, { userId: context.userId, organizationId: context.organizationId });
        if (job.status === 'COMPLETED' && job.result) return job.result;
        if (job.status === 'FAILED') throw new Error(`Worker failed: ${job.result?.reasonCode ?? 'unknown'}`);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      throw new Error(`Worker timed out: ${jobId}`);
    };
  } else {
    const tutor = new BedrockRagTutor(bedrockConfigFromEnv());
    answer = question => tutor.answer({ question, context, requestedAction: 'explanation' });
  }
  let failed = false;
  try {
    for (const test of cases) {
      const result = await answer(test.question);
      const pass = result.status === test.expected &&
        (result.status === 'SUPPORTED' ? Boolean(result.message?.trim() && result.citations?.length) : !result.citations?.length);
      failed ||= !pass;
      console.log(JSON.stringify({ ...test, pass, result }, null, 2));
    }
  } finally { close(); }
  if (failed) process.exitCode = 1;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
