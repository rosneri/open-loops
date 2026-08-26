import { randomUUID } from 'node:crypto';
import type { IdGenerator } from '@open-loops/kernel';

export class UuidIdGenerator implements IdGenerator {
  public next(): string {
    return randomUUID();
  }
}
