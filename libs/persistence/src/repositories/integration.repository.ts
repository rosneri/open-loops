import type { SourceProvider } from '@open-loops/kernel';
import type { Integration, IntegrationId, IntegrationRepository } from '@open-loops/integrations';
import { ConnectionStatus } from '@open-loops/integrations';
import type { PrismaClient } from '../prisma-client.js';
import { toDomain, toRow } from '../mappers/integration.mapper.js';

export class PrismaIntegrationRepository implements IntegrationRepository {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly ownerId: string,
  ) {}

  public async findById(id: IntegrationId): Promise<Integration | undefined> {
    const row = await this.prisma.integration.findFirst({ where: { id, ownerId: this.ownerId } });
    return row === null ? undefined : toDomain(row);
  }

  public async findByProvider(provider: SourceProvider): Promise<Integration | undefined> {
    const row = await this.prisma.integration.findUnique({
      where: { ownerId_provider: { ownerId: this.ownerId, provider } },
    });
    return row === null ? undefined : toDomain(row);
  }

  public async listAll(): Promise<readonly Integration[]> {
    const rows = await this.prisma.integration.findMany({
      where: { ownerId: this.ownerId },
      orderBy: { provider: 'asc' },
    });
    return rows.map(toDomain);
  }

  public async listActive(): Promise<readonly Integration[]> {
    const rows = await this.prisma.integration.findMany({
      where: { ownerId: this.ownerId, status: ConnectionStatus.Active },
      orderBy: { provider: 'asc' },
    });
    return rows.map(toDomain);
  }

  public async save(integration: Integration): Promise<void> {
    const { id, ...rest } = toRow(integration.snapshot());
    await this.prisma.integration.upsert({
      where: { id },
      create: { id, ownerId: this.ownerId, ...rest },
      update: rest,
    });
  }
}
