import { AuthContext } from '../contracts/user';
import { Training } from '../contracts/learning';
import { StudyContext } from '../contracts/study-context';
import { asAssignmentId, asOrganizationId, asRuleVersionId, asTrainingId, asUserId } from '../contracts/common';

export const mockUsers: Record<string, AuthContext> = {
  'mock-user-001': { userId: asUserId('user-001'), organizationId: asOrganizationId('school-001'), role: 'student', trainingIds: [asTrainingId('training-001')], expiresAt: '2099-01-01T00:00:00Z' },
  'mock-user-002': { userId: asUserId('user-002'), organizationId: asOrganizationId('school-002'), role: 'student', trainingIds: [asTrainingId('training-002')], expiresAt: '2099-01-01T00:00:00Z' },
  'mock-user-003': { userId: asUserId('user-003'), organizationId: asOrganizationId('school-001'), role: 'teacher', trainingIds: [asTrainingId('training-001')], expiresAt: '2099-01-01T00:00:00Z' }
};
export const trainings: Training[] = [
  { trainingId: asTrainingId('training-001'), organizationId: asOrganizationId('school-001'), name: '情報II 基礎', status: 'active' },
  { trainingId: asTrainingId('training-002'), organizationId: asOrganizationId('school-002'), name: '情報II 演習', status: 'active' }
];
export const studyContexts: StudyContext[] = [
  { userId: asUserId('user-001'), organizationId: asOrganizationId('school-001'), trainingId: asTrainingId('training-001'), assignmentId: asAssignmentId('assignment-001'), mode: 'learning', assistancePolicy: 'hint', ruleVersionId: asRuleVersionId('rule-v1') },
  { userId: asUserId('user-003'), organizationId: asOrganizationId('school-001'), trainingId: asTrainingId('training-001'), assignmentId: asAssignmentId('assignment-001'), mode: 'assessment', assistancePolicy: 'none', ruleVersionId: asRuleVersionId('rule-v1') },
  { userId: asUserId('user-002'), organizationId: asOrganizationId('school-002'), trainingId: asTrainingId('training-002'), assignmentId: asAssignmentId('assignment-002'), mode: 'learning', assistancePolicy: 'guided', ruleVersionId: asRuleVersionId('rule-v1') }
];