import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { IngestResultDto, PendingProbeDto } from '@open-loops/contracts';
import { asInstant } from '@open-loops/kernel';
import type { SourceCatalog } from '@open-loops/plugin-host';
import type { ConnectionMode } from '@open-loops/integrations';

import type { Signal, SignalActor } from '@open-loops/signals';
import { Tokens } from '../../tokens.js';
import { WorkspaceFactory } from '../../infrastructure/workspace.factory.js';
import { OwnerResolver } from '../auth/owner-resolver.service.js';
import { AgentTokenGuard } from './agent-token.guard.js';
import { Public } from '@open-loops/plugin-nest';

const actorSchema = z.object({
  displayName: z.string().min(1),
  handle: z.string().optional(),
  email: z.string().optional(),
  isMe: z.boolean().default(false),
});

const signalSchema = z.object({
  provider: z.string().min(1),
  externalId: z.string().min(1),
  kind: z.enum([
    'CHAT_MESSAGE',
    'EMAIL',
    'ISSUE',
    'PULL_REQUEST',
    'REVIEW_REQUEST',
    'CALENDAR_EVENT',
    'COMMENT',
    'DOCUMENT',
    'MEETING_NOTE',
  ]),
  title: z.string().default(''),
  body: z.string().default(''),
  author: actorSchema,
  participants: z.array(actorSchema).default([]),
  /*
   * Parsed here rather than trusted. An unparseable date used to survive validation, become a
   * NaN instant and reach Prisma as an Invalid Date, which the agent saw as an opaque 500 —
   * a timestamp it could not have known was wrong.
   */
  occurredAtIso: z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'occurredAtIso must be a date, e.g. 2026-08-26T09:30:00.000Z'),
  threadRef: z.string().optional(),
  url: z.string().optional(),
  channel: z.string().optional(),
  isDirectedAtMe: z.boolean().default(false),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const ingestSchema = z.object({ signals: z.array(signalSchema).min(1).max(500) });

const evidenceSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.string().min(1),
        verdict: z.enum(['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE']),
        summary: z.string().max(400),
        url: z.string().optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** Names the account these signals belong to; optional while there is only one. */
export const USER_HEADER = 'x-open-loops-user';

/**
 * The contract between Open Loops and whichever AI client drives it locally. Deliberately three
 * endpoints: push what you saw, read the questions, answer the questions.
 */
@Controller('api/agent')
// No browser calls these, so they authenticate with a shared secret instead of a session.
@Public()
@UseGuards(AgentTokenGuard)
export class AgentController {
  public constructor(
    private readonly workspaces: WorkspaceFactory,
    private readonly owners: OwnerResolver,
    @Inject(Tokens.ConnectionMode) private readonly mode: ConnectionMode,
    @Inject(Tokens.SourceCatalog) private readonly sources: SourceCatalog,
  ) {}

  @Post('ingest')
  public async ingestSignals(
    @Headers(USER_HEADER) email: string | undefined,
    @Body() body: unknown,
  ): Promise<IngestResultDto> {
    const { signals } = parsed(ingestSchema, body);
    const workspace = this.workspaces.for(await this.owners.resolve(email));
    /*
     * A provider no installed plugin claims comes back in `rejected`, naming itself. It used to
     * be filed under a catch-all `MANUAL` provider, which meant a typo in the agent's push
     * looked like a successful ingest and turned up later as a loop from nowhere in particular.
     */
    return await workspace.ingest.execute({
      mode: this.mode,
      known: new Set(this.sources.providers()),
      signals: signals.map(toSignal),
    });
  }

  @Get('probes')
  public async probes(
    @Headers(USER_HEADER) email: string | undefined,
  ): Promise<{ probes: readonly PendingProbeDto[] }> {
    const workspace = this.workspaces.for(await this.owners.resolve(email));
    return { probes: await workspace.probes.pending() };
  }

  @Post('evidence')
  public async evidence(
    @Headers(USER_HEADER) email: string | undefined,
    @Body() body: unknown,
  ): Promise<{ applied: number }> {
    const { answers } = parsed(evidenceSchema, body);
    const workspace = this.workspaces.for(await this.owners.resolve(email));
    return {
      applied: await workspace.probes.answer(
        answers.map((answer) => ({
          id: answer.id,
          verdict: answer.verdict,
          summary: answer.summary,
          ...(answer.url === undefined ? {} : { url: answer.url }),
        })),
      ),
    };
  }
}

/**
 * A body this door cannot read is the caller's mistake, so it is a 400 that names the field.
 * `parse` throws a raw `ZodError`, which Nest reports as "Internal server error" — the agent
 * pushing a recap with a timestamp it got wrong deserves to be told which one, not to be told
 * the server broke.
 */
const parsed = <TSchema extends z.ZodType>(schema: TSchema, body: unknown): z.infer<TSchema> => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
    );
  }
  return result.data;
};

type SignalInput = z.infer<typeof signalSchema>;

/** `exactOptionalPropertyTypes` means an absent field and an explicit `undefined` differ. */
const toActor = (actor: z.infer<typeof actorSchema>): SignalActor => ({
  displayName: actor.displayName,
  isMe: actor.isMe,
  ...(actor.handle === undefined ? {} : { handle: actor.handle }),
  ...(actor.email === undefined ? {} : { email: actor.email }),
});

const toSignal = (signal: SignalInput): Signal => {
  return {
    provider: signal.provider.toUpperCase(),
    externalId: signal.externalId,
    kind: signal.kind,
    title: signal.title,
    body: signal.body,
    author: toActor(signal.author),
    participants: signal.participants.map(toActor),
    occurredAt: asInstant(Date.parse(signal.occurredAtIso)),
    isDirectedAtMe: signal.isDirectedAtMe,
    ...(signal.threadRef === undefined ? {} : { threadRef: signal.threadRef }),
    ...(signal.url === undefined ? {} : { url: signal.url }),
    ...(signal.channel === undefined ? {} : { channel: signal.channel }),
    ...(signal.metadata === undefined ? {} : { metadata: signal.metadata }),
  };
};
