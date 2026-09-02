import type { Request } from 'express';

/** Who the session cookie resolved to. The id is also the tenancy key everywhere below. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly username: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
