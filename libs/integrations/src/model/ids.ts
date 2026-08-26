import type { Brand } from '@open-loops/kernel';

export type IntegrationId = Brand<string, 'IntegrationId'>;
export const asIntegrationId = (value: string): IntegrationId => value as IntegrationId;
