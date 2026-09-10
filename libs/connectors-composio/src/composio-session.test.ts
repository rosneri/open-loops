import { describe, expect, it, vi } from 'vitest';
import type { Composio } from '@composio/core';
import type { Logger } from '@open-loops/kernel';
import { ComposioSessionProvider, ComposioSessionRegistry } from './composio-session.js';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Stands in for the SDK client: `create(userId)` is the only method a session provider calls. */
const fakeClient = (): {
  composio: Composio;
  created: string[];
  toolkits: (readonly string[])[];
} => {
  const created: string[] = [];
  const toolkits: (readonly string[])[] = [];
  const composio = {
    create: (userId: string, options?: { toolkits?: readonly string[] }) => {
      created.push(userId);
      toolkits.push(options?.toolkits ?? []);
      return Promise.resolve({ sessionId: `session-${userId}` });
    },
  } as unknown as Composio;
  return { composio, created, toolkits };
};

const TOOLKITS = ['gmail', 'CUSTOM_WISPR_FLOW'];

describe('composio session provider', () => {
  it('resolves the identity once and reuses the session', async () => {
    const { composio, created } = fakeClient();
    const identity = vi.fn(() => Promise.resolve('neri'));
    const provider = new ComposioSessionProvider({ composio, logger, identity, toolkits: TOOLKITS });

    await Promise.all([provider.session$(), provider.session$()]);
    await provider.session$();

    expect(identity).toHaveBeenCalledTimes(1);
    expect(created).toEqual(['neri']);
  });

  /** A blip reading the account row must not disable that account until the process restarts. */
  it('does not cache a failed identity lookup', async () => {
    const { composio } = fakeClient();
    const identity = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('database asleep'))
      .mockResolvedValue('neri');
    const provider = new ComposioSessionProvider({ composio, logger, identity, toolkits: TOOLKITS });

    await expect(provider.session$()).rejects.toThrow('database asleep');
    await expect(provider.userId$()).resolves.toBe('neri');
  });

  it('rebuilds the session after an auth change, keeping the identity', async () => {
    const { composio, created } = fakeClient();
    const provider = new ComposioSessionProvider({
      composio,
      logger,
      identity: () => Promise.resolve('neri'),
      toolkits: TOOLKITS,
    });

    await provider.session$();
    provider.invalidate();
    await provider.session$();

    expect(created).toEqual(['neri', 'neri']);
  });
});

describe('composio session registry', () => {
  const registry = (identity: (ownerId: string) => Promise<string>): ComposioSessionRegistry =>
    new ComposioSessionRegistry({ apiKey: 'test-key', logger, identity, toolkits: TOOLKITS });

  /** The whole point: two accounts are two Composio identities, never one shared connection. */
  it('gives each owner its own session, asked for under its own identity', async () => {
    const sessions = registry((ownerId) => Promise.resolve(`composio-${ownerId}`));

    await expect(sessions.for('user-1').userId$()).resolves.toBe('composio-user-1');
    await expect(sessions.for('user-2').userId$()).resolves.toBe('composio-user-2');
  });

  it('reuses one provider per owner rather than one per request', () => {
    const sessions = registry((ownerId) => Promise.resolve(ownerId));

    expect(sessions.for('user-1')).toBe(sessions.for('user-1'));
    expect(sessions.for('user-1')).not.toBe(sessions.for('user-2'));
  });

  it('forgets an owner so the next request builds a fresh session', () => {
    const sessions = registry((ownerId) => Promise.resolve(ownerId));
    const before = sessions.for('user-1');

    sessions.forget('user-1');

    expect(sessions.for('user-1')).not.toBe(before);
  });

  /**
   * The regression this exists for: a session built with no toolkits gets Composio's default
   * catalogue, which omits a custom toolkit this project registered. The connection then reads
   * back as inactive and a finished consent screen reports "authorisation did not complete".
   */
  it('builds the session over the toolkits this deployment installed', async () => {
    const { composio, toolkits } = fakeClient();
    const provider = new ComposioSessionProvider({
      composio,
      logger,
      identity: () => Promise.resolve('neri'),
      toolkits: TOOLKITS,
    });

    await provider.session$();

    expect(toolkits[0]).toContain('CUSTOM_WISPR_FLOW');
  });
});
