import { SetMetadata } from '@nestjs/common';

export const PUBLIC_ROUTE = 'ol:public-route';

/**
 * The session guard is global, so opting out is explicit and visible at the handler. Only three
 * kinds of route may carry this: the login endpoint itself, a liveness probe, and endpoints that
 * a browser never calls and that authenticate with their own shared secret instead.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);
