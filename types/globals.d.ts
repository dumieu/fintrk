export {};

declare global {
  interface CustomJwtSessionClaims {
    metadata?: {
      plan?: string;
      planStatus?: string;
      planRenewsAt?: number;
    };
    plan?: string;
    planStatus?: string;
    planRenewsAt?: number;
  }
}
