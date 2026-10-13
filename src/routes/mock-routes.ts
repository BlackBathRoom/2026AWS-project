import { Router, Request, Response } from 'express';
import { studyContexts, trainings } from '../mocks/sample-data';
import { requireMockAuth } from '../middleware/mock-auth';
import { idSchema } from '../contracts/common';

function error(res: Response, req: Request, status: number, code: 'VALIDATION_ERROR' | 'NOT_FOUND', message: string): void { res.status(status).json({ code, message, requestId: req.requestId, timestamp: new Date().toISOString() }); }
export const mockRouter = Router();
mockRouter.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
mockRouter.use(requireMockAuth);
mockRouter.get('/me', (req, res) => { const auth = req.auth!; res.json({ userId: auth.userId, organizationId: auth.organizationId, role: auth.role, trainingIds: auth.trainingIds }); });
mockRouter.get('/trainings', (req, res) => {
  const auth = req.auth!;
  const rawTrainingId = req.query.trainingId;
  if (rawTrainingId !== undefined && (typeof rawTrainingId !== 'string' || !idSchema.safeParse(rawTrainingId).success)) { error(res, req, 400, 'VALIDATION_ERROR', 'trainingId の形式が不正です'); return; }
  const requestedId = rawTrainingId as string | undefined;
  const visible = trainings.filter((training) => training.organizationId === auth.organizationId && auth.trainingIds.includes(training.trainingId));
  if (requestedId && !visible.some((training) => training.trainingId === requestedId)) { error(res, req, 404, 'NOT_FOUND', '指定された研修が見つかりません'); return; }
  res.json({ items: requestedId ? visible.filter((training) => training.trainingId === requestedId) : visible });
});
mockRouter.get('/study-context', (req, res) => {
  const rawTrainingId = req.query.trainingId;
  const rawAssignmentId = req.query.assignmentId;
  if (typeof rawTrainingId !== 'string' || !idSchema.safeParse(rawTrainingId).success) { error(res, req, 400, 'VALIDATION_ERROR', 'trainingId の形式が不正です'); return; }
  if (typeof rawAssignmentId !== 'string' || !idSchema.safeParse(rawAssignmentId).success) { error(res, req, 400, 'VALIDATION_ERROR', 'assignmentId の形式が不正です'); return; }
  const trainingId = rawTrainingId;
  const assignmentId = rawAssignmentId;
  if (!trainingId || !assignmentId) { error(res, req, 400, 'VALIDATION_ERROR', 'trainingId と assignmentId は必須です'); return; }
  const auth = req.auth!;
  const context = studyContexts.find((item) => item.userId === auth.userId && item.organizationId === auth.organizationId && item.trainingId === trainingId && item.assignmentId === assignmentId);
  if (!context) { error(res, req, 404, 'NOT_FOUND', '学習コンテキストが見つかりません'); return; }
  res.json(context);
});