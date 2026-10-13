import { asAssignmentId, asOrganizationId, asRuleVersionId, asTrainingId, asUserId } from '../contracts/common';
import { ApprovedQuestion, Attempt, AuditEvent, CompetencyAssessment, DeletionRecord, FileMetadata, KnowledgeEdge, KnowledgeProgress, Policy, ReviewAppeal, ReviewAssignment, Submission, SubmissionVersion, TrainingAssignment, TrainingProfile, TutorJob, UsageCounter, Organization, UserRecord, Membership, LearningHistory, Attainment, ReEvaluation } from '../contracts/backend';
import { mockUsers, studyContexts, trainings } from '../mocks/sample-data';

export interface BackendRepository {
  organizations: Organization[]; users: UserRecord[]; memberships: Membership[]; questions: ApprovedQuestion[]; knowledgeEdges: KnowledgeEdge[]; attempts: Attempt[]; progress: KnowledgeProgress[]; histories: LearningHistory[]; attainments: Attainment[]; assignments: TrainingAssignment[]; submissions: Submission[]; submissionVersions: SubmissionVersion[]; files: FileMetadata[]; reviewAssignments: ReviewAssignment[]; assessments: CompetencyAssessment[]; reEvaluations: ReEvaluation[]; appeals: ReviewAppeal[]; profiles: TrainingProfile[]; policies: Policy[]; usage: UsageCounter[]; deletions: DeletionRecord[]; audits: AuditEvent[]; jobs: TutorJob[]; idempotency: Map<string, unknown>;
}

export class InMemoryBackendRepository implements BackendRepository {
  organizations: Organization[] = [{ organizationId: 'school-001' as Organization['organizationId'], name: '学校001', status: 'active' }, { organizationId: 'school-002' as Organization['organizationId'], name: '学校002', status: 'active' }];
  users: UserRecord[] = [];
  memberships: Membership[] = Object.values(mockUsers).map((user) => ({ userId: user.userId, organizationId: user.organizationId, trainingIds: user.trainingIds, startsAt: '2026-01-01T00:00:00Z', endsAt: user.userId === 'user-006' ? '2026-01-01T00:00:00Z' : null, status: user.userId === 'user-006' ? 'ended' : 'active' }));
  questions: ApprovedQuestion[] = [{ questionId: 'question-001' as ApprovedQuestion['questionId'], version: 'question-version-001' as ApprovedQuestion['version'], organizationId: asOrganizationId('school-001'), trainingId: asTrainingId('training-001'), conceptId: 'concept-001' as ApprovedQuestion['conceptId'], format: 'single_choice', prompt: '2進数の10を10進数で表した値は？', choices: ['2', '10', '12'], correctAnswer: ['b'], approvalStatus: 'APPROVED', ruleVersionId: asRuleVersionId('rule-v1') }];
  knowledgeEdges: KnowledgeEdge[] = [];
  attempts: Attempt[] = [];
  progress: KnowledgeProgress[] = [];
  histories: LearningHistory[] = [];
  attainments: Attainment[] = [];
  assignments: TrainingAssignment[] = [{ assignmentId: asAssignmentId('assignment-001'), version: 'assignment-version-001', organizationId: asOrganizationId('school-001'), trainingId: asTrainingId('training-001'), unitId: 'unit-001', axis: 'P', rubricVersionId: 'rubric-v1' as TrainingAssignment['rubricVersionId'], assistancePolicy: 'hint', requiredOutputs: ['text'], status: 'published', required: true }];
  submissions: Submission[] = [];
  submissionVersions: SubmissionVersion[] = [];
  files: FileMetadata[] = [];
  reviewAssignments: ReviewAssignment[] = [];
  assessments: CompetencyAssessment[] = [];
  reEvaluations: ReEvaluation[] = [];
  appeals: ReviewAppeal[] = [];
  profiles: TrainingProfile[] = [];
  policies: Policy[] = [{ organizationId: asOrganizationId('school-001'), version: 'policy-v1' as Policy['version'], aiEnabled: true, dailyAiLimit: 20, concurrentJobLimit: 1, allowAnswer: true, updatedAt: new Date().toISOString() }, { organizationId: asOrganizationId('school-002'), version: 'policy-v1' as Policy['version'], aiEnabled: true, dailyAiLimit: 20, concurrentJobLimit: 1, allowAnswer: true, updatedAt: new Date().toISOString() }];
  usage: UsageCounter[] = [];
  deletions: DeletionRecord[] = [];
  audits: AuditEvent[] = [];
  jobs: TutorJob[] = [];
  idempotency = new Map<string, unknown>();

  getTraining(trainingId: string) { return trainings.find((item) => item.trainingId === trainingId); }
  getStudyContext(userId: string, trainingId: string, assignmentId: string) { return studyContexts.find((item) => item.userId === userId && item.trainingId === trainingId && item.assignmentId === assignmentId); }
  getQuestion(questionId: string) { return this.questions.find((item) => item.questionId === questionId); }
  getAssignment(assignmentId: string) { return this.assignments.find((item) => item.assignmentId === assignmentId && item.status === 'published'); }
  getPolicy(organizationId: string) { return this.policies.find((item) => item.organizationId === organizationId); }
}

export const backendRepository = new InMemoryBackendRepository();