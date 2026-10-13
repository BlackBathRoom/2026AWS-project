import { AuthContext } from '../contracts/user';

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