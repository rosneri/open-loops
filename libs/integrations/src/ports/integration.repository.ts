import type { SourceProvider } from '@open-loops/kernel';
import type { Integration } from '../model/integration.js';
import type { IntegrationId } from '../model/ids.js';

export interface IntegrationRepository {
  findById(id: IntegrationId): Promise<Integration | undefined>;
  findByProvider(provider: SourceProvider): Promise<Integration | undefined>;
  listAll(): Promise<readonly Integration[]>;
  listActive(): Promise<readonly Integration[]>;
  save(integration: Integration): Promise<void>;
}
