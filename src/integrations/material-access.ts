import { AuthContext } from '../contracts/user';

export const materialFiles: Readonly<Record<string, readonly string[]>> = {
  'ii-0': ['00_cover.pdf'], 'ii-1': ['01_chapter1.pdf'], 'ii-2': ['02_chapter2.pdf'],
  'ii-3': ['03_chapter3_part1.pdf', '03_chapter3_part2.pdf'],
  'ii-4': ['04_chapter4.pdf'], 'ii-5': ['05_chapter5.pdf'],
};

// Entitlements are administered on the server. Never use a browser-supplied role/training.
export function materialTraining(auth: AuthContext, env: NodeJS.ProcessEnv = process.env): AuthContext['trainingIds'][number] | undefined {
  if (env.NODE_ENV !== 'production') return auth.trainingIds[0];
  if (!['student', 'teacher', 'reviewer', 'admin'].includes(auth.role)) return undefined;
  let entries: unknown;
  try { entries = JSON.parse(env.MATERIALS_ENTITLEMENTS_JSON || '{}'); } catch { return undefined; }
  if (!entries || typeof entries !== 'object' || Array.isArray(entries) ||
      !Object.prototype.hasOwnProperty.call(entries, auth.organizationId)) return undefined;
  const allowed = (entries as Record<string, unknown>)[auth.organizationId];
  if (!Array.isArray(allowed)) return undefined;
  return auth.trainingIds.find(training => allowed.includes(training));
}

export function selectedMaterial(id: string): readonly string[] | undefined {
  return Object.prototype.hasOwnProperty.call(materialFiles, id) ? materialFiles[id] : undefined;
}
