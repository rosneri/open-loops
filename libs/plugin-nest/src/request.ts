import type { Request } from 'express';

/** Who the session cookie resolved to. The id is also the tenancy key everywhere below. */
export interface AuthenticatedUser {
  readonly id: string;
  /** The address this person signs in with, and the name every machine caller knows them by. */
  readonly email: string;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
