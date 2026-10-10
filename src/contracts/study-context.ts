import { z } from 'zod';
import { AssignmentId, OrganizationId, RuleVersionId, TrainingId, UserId } from './common';

export const studyModes = ['learning', 'assessment'] as const;
export type StudyMode = (typeof studyModes)[number];
export const assistancePolicies = ['none', 'hint', 'guided'] as const;
export type AssistancePolicy = (typeof assistancePolicies)[number];
export interface StudyContext { userId: UserId; organizationId: OrganizationId; trainingId: TrainingId; assignmentId: AssignmentId; mode: StudyMode; assistancePolicy: AssistancePolicy; ruleVersionId: RuleVersionId; }
export const studyContextSchema = z.object({ userId: z.string(), organizationId: z.string(), trainingId: z.string(), assignmentId: z.string(), mode: z.enum(studyModes), assistancePolicy: z.enum(assistancePolicies), ruleVersionId: z.string() });