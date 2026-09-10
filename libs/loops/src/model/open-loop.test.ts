import { describe, expect, it } from 'vitest';
import { SourceProvider, asInstant, asMinutes } from '@open-loops/kernel';
import { CriterionRole } from './completion-criterion.js';
import { EvidenceVerdict } from './evidence.js';
import { asCriterionId, asOpenLoopId } from './ids.js';
import { LoopEventType } from './loop-events.js';
import { LoopKind } from './loop-kind.js';
import { LoopStatus } from './loop-status.js';
import { OpenLoop } from './open-loop.js';
import { manualConfirmation } from './probe.js';

const NOW = asInstant(1_000_000);

const makeLoop = (): OpenLoop =>
  OpenLoop.create({
    id: asOpenLoopId('loop-1'),
    kind: LoopKind.OutgoingCommitment,
    title: 'Open the rate-limiting PR',
    summary: 'Told Dana in #eng the PR would go up today.',
    source: { provider: SourceProvider.Slack, externalId: 'C1/1700000000.1', occurredAt: NOW },
    criteria: [
      {
        id: asCriterionId('c-pr'),
        role: CriterionRole.Deliverable,
        optional: false,
        probe: manualConfirmation('a PR exists'),
      },
    ],
    evidence: [],
    estimate: asMinutes(45),
    priority: 60,
    confidence: 0.9,
    createdAt: NOW,
    updatedAt: NOW,
  });

describe('OpenLoop', () => {
  it('emits a created event', () => {
    const events = makeLoop().pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(LoopEventType.Created);
  });

  it('rejects an empty title', () => {
    expect(() =>
      OpenLoop.create({ ...makeLoop().snapshot(), title: '   ' }),
    ).toThrow(/title/i);
  });

  it('emits a status change when satisfying evidence arrives', () => {
    const loop = makeLoop();
    loop.pullEvents();
    loop.recordEvidence({
      at: asInstant(NOW + 1000),
      observations: [
        {
          criterionId: asCriterionId('c-pr'),
          verdict: EvidenceVerdict.Satisfied,
          observedAt: asInstant(NOW + 1000),
          summary: 'PR #412 opened',
        },
      ],
    });
    const change = loop.pullEvents().find((event) => event.type === LoopEventType.StatusChanged);
    expect(change).toBeDefined();
    expect(loop.view(asInstant(NOW + 1000)).status).toBe(LoopStatus.DoneUnconfirmed);
  });

  it('hides a snoozed loop until its deadline and no longer', () => {
    const loop = makeLoop();
    loop.snooze({ until: asInstant(NOW + 5000), at: NOW });
    expect(loop.view(asInstant(NOW + 1000)).status).toBe(LoopStatus.Snoozed);
    expect(loop.view(asInstant(NOW + 6000)).status).toBe(LoopStatus.Open);
  });

  it('refuses to snooze into the past', () => {
    expect(() => { makeLoop().snooze({ until: asInstant(NOW - 1), at: NOW }); }).toThrow(/future/i);
  });

  it('clears both the manual resolution and the snooze on reopen', () => {
    const loop = makeLoop();
    loop.drop({ reason: 'not mine after all', at: NOW });
    expect(loop.view(NOW).status).toBe(LoopStatus.Dropped);
    loop.reopen(asInstant(NOW + 10));
    expect(loop.view(asInstant(NOW + 10)).status).toBe(LoopStatus.Open);
  });

  it('appends evidence rather than replacing it', () => {
    const loop = makeLoop();
    const observation = {
      criterionId: asCriterionId('c-pr'),
      verdict: EvidenceVerdict.NotSatisfied,
      observedAt: NOW,
      summary: 'nothing yet',
    };
    loop.recordEvidence({ observations: [observation], at: NOW });
    loop.recordEvidence({ observations: [observation], at: asInstant(NOW + 1) });
    expect(loop.snapshot().evidence).toHaveLength(2);
  });
});

describe('restating a loop when its signal changed', () => {
  const later = asInstant(2_000_000);

  it('takes the new wording and keeps everything the loop has since accumulated', () => {
    const loop = makeLoop();
    const before = loop.snapshot();

    const changed = loop.restate({
      title: 'Setup the devops',
      summary: 'Status: Hold / In review',
      at: later,
    });

    expect(changed).toBe(true);
    const after = loop.snapshot();
    expect(after.title).toBe('Setup the devops');
    // Identity, criteria and evidence did not become untrue when the title did.
    expect(after.id).toBe(before.id);
    expect(after.criteria).toEqual(before.criteria);
    expect(after.evidence).toEqual(before.evidence);
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.updatedAt).toBe(later);
  });

  it('says nothing changed when the wording is the same, so no write happens', () => {
    const loop = makeLoop();
    const before = loop.snapshot();

    expect(
      loop.restate({ title: before.title, summary: before.summary, at: later }),
    ).toBe(false);
    expect(loop.snapshot().updatedAt).toBe(before.updatedAt);
  });

  /**
   * Rewriting the title of something a person already marked done would edit the record of what
   * they decided about, after they decided it.
   */
  it('refuses once a person has settled it', () => {
    const loop = makeLoop();
    loop.confirmDone({ reason: 'shipped it', at: later });

    expect(loop.restate({ title: 'Something else', summary: 'new', at: later })).toBe(false);
    expect(loop.snapshot().title).toBe('Open the rate-limiting PR');
    expect(loop.view(later).status).toBe(LoopStatus.Done);
  });
});
