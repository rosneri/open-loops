import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { IngestResultDto, PendingProbeDto } from '@open-loops/contracts';
import { asInstant, isSourceProvider } from '@open-loops/kernel';
import type { ConnectionMode } from '@open-loops/integrations';
import type { IngestSignalsUseCase } from '@open-loops/orchestration';
import type { PrismaProbeTaskStore } from '@open-loops/persistence';
import type { Signal, SignalActor } from '@open-loops/signals';
import { Tokens } from '../../tokens.js';
import { AgentTokenGuard } from './agent-token.guard.js';
import { Public } from '../auth/public.decorator.js';

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
  occurredAtIso: z.string(),
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
    @Inject(Tokens.IngestSignals) private readonly ingest: IngestSignalsUseCase,
    @Inject(Tokens.ProbeTaskStore) private readonly probeTasks: PrismaProbeTaskStore,
    @Inject(Tokens.ConnectionMode) private readonly mode: ConnectionMode,
  ) {}

  @Post('ingest')
  public async ingestSignals(@Body() body: unknown): Promise<IngestResultDto> {
    const { signals } = ingestSchema.parse(body);
    return await this.ingest.execute({ mode: this.mode, signals: signals.map(toSignal) });
  }

  @Get('probes')
  public async probes(): Promise<{ probes: readonly PendingProbeDto[] }> {
    return { probes: await this.probeTasks.pending() };
  }

  @Post('evidence')
  public async evidence(@Body() body: unknown): Promise<{ applied: number }> {
    const { answers } = evidenceSchema.parse(body);
    return {
      applied: await this.probeTasks.answer(
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

type SignalInput = z.infer<typeof signalSchema>;

/** `exactOptionalPropertyTypes` means an absent field and an explicit `undefined` differ. */
const toActor = (actor: z.infer<typeof actorSchema>): SignalActor => ({
  displayName: actor.displayName,
  isMe: actor.isMe,
  ...(actor.handle === undefined ? {} : { handle: actor.handle }),
  ...(actor.email === undefined ? {} : { email: actor.email }),
});

const toSignal = (signal: SignalInput): Signal => {
  const provider = signal.provider.toUpperCase();
  return {
    provider: isSourceProvider(provider) ? provider : 'MANUAL',
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
