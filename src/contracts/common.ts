import { z } from 'zod';

export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type UserId = Brand<string, 'UserId'>;
export type OrganizationId = Brand<string, 'OrganizationId'>;
export type TrainingId = Brand<string, 'TrainingId'>;
export type QuestionId = Brand<string, 'QuestionId'>;
export type QuestionVersionId = Brand<string, 'QuestionVersionId'>;
export type ConceptId = Brand<string, 'ConceptId'>;
export type AssignmentId = Brand<string, 'AssignmentId'>;
export type SubmissionId = Brand<string, 'SubmissionId'>;
export type SubmissionVersionId = Brand<string, 'SubmissionVersionId'>;
export type ReviewId = Brand<string, 'ReviewId'>;
export type RubricVersionId = Brand<string, 'RubricVersionId'>;
export type RuleVersionId = Brand<string, 'RuleVersionId'>;

export const roles = ['student', 'teacher', 'admin', 'reviewer'] as const;
export type Role = (typeof roles)[number];
export const errorCodes = ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'] as const;
export type ErrorCode = (typeof errorCodes)[number];
export interface ApiError { code: ErrorCode; message: string; requestId: string; timestamp: string; }
export const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const apiErrorSchema = z.object({ code: z.enum(errorCodes), message: z.string(), requestId: z.string().min(1), timestamp: z.string().datetime({ offset: true }) });
export const asUserId = (value: string) => value as UserId;
export const asOrganizationId = (value: string) => value as OrganizationId;
export const asTrainingId = (value: string) => value as TrainingId;
export const asAssignmentId = (value: string) => value as AssignmentId;
export const asRuleVersionId = (value: string) => value as RuleVersionId;