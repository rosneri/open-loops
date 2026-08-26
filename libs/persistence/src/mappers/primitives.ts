import type { Instant } from '@open-loops/kernel';
import { asInstant } from '@open-loops/kernel';
import type { Prisma } from '../generated/prisma/client.js';

export const toInstant = (value: Date): Instant => asInstant(value.getTime());
export const toDate = (value: number): Date => new Date(value);

/**
 * Prisma's `InputJsonValue` is structurally narrower than our domain unions. Funnelling through
 * `unknown` once, here, keeps the assertion out of every mapper.
 */
export const toJson = (value: unknown): Prisma.InputJsonValue => value as Prisma.InputJsonValue;
