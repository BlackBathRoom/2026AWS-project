import { z } from 'zod';
import { OrganizationId, Role, TrainingId, UserId, roles } from './common';

export interface AuthContext { userId: UserId; organizationId: OrganizationId; role: Role; trainingIds: TrainingId[]; expiresAt: string; }
export interface UserProfile { userId: UserId; organizationId: OrganizationId; role: Role; trainingIds: TrainingId[]; }
export const authContextSchema = z.object({ userId: z.string(), organizationId: z.string(), role: z.enum(roles), trainingIds: z.array(z.string()), expiresAt: z.string().datetime({ offset: true }) });