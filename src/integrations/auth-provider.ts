import { AuthContext } from '../contracts/user';
import { asOrganizationId, asTrainingId, asUserId, roles } from '../contracts/common';

export interface AuthenticationProvider {
  verifyBearerToken(token: string): Promise<AuthContext>;
}

export interface CognitoJwtClaims {
  sub: string;
  iss: string;
  exp: number;
  iat: number;
  aud?: string;
  client_id?: string;
}

// B-02: Cognito JWKS取得、署名、issuer、audience、exp検証を実装する。
export type CognitoAuthenticationConfig = { issuer: string; audience: string; region: string; userPoolId: string };

export function cognitoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CognitoAuthenticationConfig {
  const region = env.COGNITO_REGION;
  const userPoolId = env.COGNITO_USER_POOL_ID;
  const audience = env.COGNITO_AUDIENCE;
  if (!region || !userPoolId || !audience) throw new Error('Cognito authentication configuration is incomplete');
  return { region, userPoolId, audience, issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` };
}

export class CognitoJwtAuthenticationProvider implements AuthenticationProvider {
  private jwks?: unknown;

  constructor(private readonly config: CognitoAuthenticationConfig) {}

  async verifyBearerToken(token: string): Promise<AuthContext> {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(`${this.config.issuer}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, this.jwks as ReturnType<typeof createRemoteJWKSet>, { issuer: this.config.issuer, audience: this.config.audience });
    const userId = payload.sub;
    const organizationId = this.stringClaim(payload, ['custom:organizationId', 'organizationId']);
    const role = this.stringClaim(payload, ['custom:role', 'role']);
    const trainingClaim = payload['custom:trainingIds'] ?? payload.trainingIds;
    const trainingIds = Array.isArray(trainingClaim) ? trainingClaim.filter((value): value is string => typeof value === 'string') : [];
    if (!userId || !organizationId || !role || !roles.includes(role as typeof roles[number]) || !payload.iat || !payload.exp) throw new Error('Required Cognito claims are missing');
    return { userId: asUserId(userId), organizationId: asOrganizationId(organizationId), role: role as AuthContext['role'], trainingIds: trainingIds.map(asTrainingId), issuedAt: new Date(payload.iat * 1000).toISOString(), expiresAt: new Date(payload.exp * 1000).toISOString() };
  }

  private stringClaim(payload: Record<string, unknown>, names: string[]): string | undefined {
    for (const name of names) if (typeof payload[name] === 'string') return payload[name] as string;
    return undefined;
  }
}