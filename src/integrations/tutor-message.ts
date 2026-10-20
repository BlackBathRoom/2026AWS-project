// SQS 経由で B(受付API) から C(AI worker) へ渡すジョブメッセージの契約。
// B は認可・利用枠ゲート通過後にこのメッセージを enqueue し、worker がこれを消費する。

import { z } from 'zod';
import { InternalStudyContext, studyModes, assistancePolicies } from '../contracts/study-context';

export const requestedActions = ['hint', 'explanation', 'example', 'answer'] as const;

const internalStudyContextSchema = z.object({
  userId: z.string(),
  organizationId: z.string(),
  trainingId: z.string(),
  assignmentId: z.string(),
  mode: z.enum(studyModes),
  assistancePolicy: z.enum(assistancePolicies),
  ruleVersionId: z.string(),
  purpose: z.enum(['learning', 'assessment', 'review']),
  conceptIds: z.array(z.string()),
  errorType: z.string().optional(),
  allowAnswer: z.boolean(),
  policyVersion: z.string(),
});

export const tutorJobMessageSchema = z.object({
  jobId: z.string().min(1),
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  question: z.string().min(1).max(2000),
  requestedAction: z.enum(requestedActions),
  context: internalStudyContextSchema,
});

export type TutorJobMessage = {
  jobId: string;
  userId: string;
  organizationId: string;
  question: string;
  requestedAction: (typeof requestedActions)[number];
  context: InternalStudyContext;
};

// @types/aws-lambda を追加せずに済むよう、worker が必要とする SQS イベント型の最小部分集合を定義する。
export interface SQSRecord { messageId: string; body: string; }
export interface SQSEvent { Records: SQSRecord[]; }
export interface SQSBatchResponse { batchItemFailures: { itemIdentifier: string }[]; }
