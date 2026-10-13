import { AssignmentId, ConceptId, OrganizationId, QuestionId, QuestionVersionId, ReviewId, RuleVersionId, RubricVersionId, SubmissionId, SubmissionVersionId, TrainingId, UserId } from './common';

export type StudyAttemptId = string & { readonly __brand: 'StudyAttemptId' };
export type FileId = string & { readonly __brand: 'FileId' };
export type DeletionRequestId = string & { readonly __brand: 'DeletionRequestId' };
export type AuditEventId = string & { readonly __brand: 'AuditEventId' };
export type PolicyVersionId = string & { readonly __brand: 'PolicyVersionId' };

export type QuestionFormat = 'single_choice' | 'multiple_choice';
export type AttemptKind = 'initial' | 'practice';
export type AttemptStatus = 'scored' | 'unscored';
export type Confidence = 'unmeasured' | 'low' | 'medium' | 'high';
export type MasteryStatus = 'mastered' | 'developing';
export type ReviewStatus = 'draft' | 'final' | 'superseded';
export type SubmissionStatus = 'draft' | 'submitted' | 'reviewed' | 'deleted';
export type Axis = 'K' | 'P' | 'E' | 'D' | 'L';
export type AttainmentStatus = 'attained' | 'not_attained' | 'pending';

export interface ApprovedQuestion { questionId: QuestionId; version: QuestionVersionId; organizationId: OrganizationId; trainingId: TrainingId; conceptId: ConceptId; format: QuestionFormat; prompt: string; choices: string[]; correctAnswer: string[]; approvalStatus: 'APPROVED'; ruleVersionId: RuleVersionId; }
export interface Attempt { attemptId: StudyAttemptId; rootAttemptId: StudyAttemptId; userId: UserId; organizationId: OrganizationId; trainingId: TrainingId; questionId: QuestionId; questionVersionId: QuestionVersionId; answer: string[]; responseTimeMs: number; kind: AttemptKind; status: AttemptStatus; correct?: boolean; scored: boolean; conceptId: ConceptId; idempotencyKey: string; createdAt: string; }
export interface KnowledgeProgress { userId: UserId; organizationId: OrganizationId; trainingId: TrainingId; conceptId: ConceptId; score: number | null; confidence: Confidence; reasons: string[]; nextReviewAt: string | null; mastery: MasteryStatus; attemptCount: number; formatCount: number; }
export interface TrainingAssignment { assignmentId: AssignmentId; version: string; organizationId: OrganizationId; trainingId: TrainingId; unitId: string; axis: Axis; rubricVersionId: RubricVersionId; assistancePolicy: 'none' | 'hint' | 'guided'; requiredOutputs: string[]; status: 'published' | 'draft'; required: boolean; }
export interface Submission { submissionId: SubmissionId; organizationId: OrganizationId; trainingId: TrainingId; assignmentId: AssignmentId; ownerId: UserId; currentVersion: number; status: SubmissionStatus; expectedVersion: number; createdAt: string; updatedAt: string; }
export interface SubmissionVersion { submissionVersionId: SubmissionVersionId; submissionId: SubmissionId; assignmentId: AssignmentId; assignmentVersion: string; ownerId: UserId; versionNumber: number; content: string; fileIds: FileId[]; aidDeclaration: 'none' | 'hint' | 'guided'; status: 'draft' | 'submitted'; submittedAt: string | null; }
export interface FileMetadata { fileId: FileId; organizationId: OrganizationId; ownerId: UserId; submissionId: SubmissionId; filename: string; mimeType: string; size: number; checksum: string; scanStatus: 'pending' | 'clean' | 'rejected'; storageKey: string; }
export interface ReviewAssignment { reviewId: ReviewId; submissionVersionId: SubmissionVersionId; reviewerId: UserId; organizationId: OrganizationId; status: 'assigned' | 'completed'; }
export interface CompetencyAssessment { assessmentId: string; submissionVersionId: SubmissionVersionId; rubricVersionId: RubricVersionId; scores: Partial<Record<Axis, number | null>>; rationale: string; evidenceRefs: string[]; reviewerId: UserId; status: ReviewStatus; version: number; }
export interface ReviewAppeal { appealId: string; assessmentId: string; requesterId: UserId; reason: string; status: 'open' | 'resolved'; reassignedReviewerId?: UserId; newAssessmentId?: string; }
export interface TrainingProfile { userId: UserId; organizationId: OrganizationId; experience: string; targetUnits: string[]; availableTimeMinutes: number; selfAssessment: Record<string, number>; version: number; }
export interface Policy { organizationId: OrganizationId; version: PolicyVersionId; aiEnabled: boolean; dailyAiLimit: number; concurrentJobLimit: number; allowAnswer: boolean; updatedAt: string; }
export interface UsageCounter { userId: UserId; dateJst: string; aiCount: number; activeJobs: number; }
export interface DeletionRecord { requestId: DeletionRequestId; organizationId: OrganizationId; subjectId: UserId; scope: 'all' | 'learning' | 'submissions'; status: 'requested' | 'applied'; requestedAt: string; }
export interface AuditEvent { eventId: AuditEventId; organizationId: OrganizationId; actorId: UserId; action: string; targetType: string; targetId: string; result: 'allowed' | 'denied'; occurredAt: string; }
export interface TutorJob { jobId: string; userId: UserId; organizationId: OrganizationId; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'UNAVAILABLE'; result?: { status: 'SUPPORTED' | 'INSUFFICIENT' | 'OUT_OF_SCOPE' | 'ERROR' | 'UNAVAILABLE'; message?: string; citations?: string[]; nextAction?: string; reasonCode?: string }; }