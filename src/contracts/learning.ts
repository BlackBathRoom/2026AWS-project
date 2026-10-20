import { OrganizationId, TrainingId } from './common';
export interface Training { trainingId: TrainingId; organizationId: OrganizationId; name: string; status: 'active' | 'archived'; }