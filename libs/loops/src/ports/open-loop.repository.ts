import type { Instant, SourceProvider } from '@open-loops/kernel';
import type { OpenLoop } from '../model/open-loop.js';
import type { OpenLoopId } from '../model/ids.js';

export interface OpenLoopQuery {
  readonly actionableOnly?: boolean;
  readonly providers?: readonly SourceProvider[];
  readonly updatedSince?: Instant;
  readonly limit?: number;
}

export interface OpenLoopRepository {
  findById(id: OpenLoopId): Promise<OpenLoop | undefined>;
  findBySourceKey(key: string): Promise<OpenLoop | undefined>;
  list(query: OpenLoopQuery): Promise<readonly OpenLoop[]>;
  save(loop: OpenLoop): Promise<void>;
  saveMany(loops: readonly OpenLoop[]): Promise<void>;
  delete(id: OpenLoopId): Promise<void>;
}
