import type { IntegrationDto } from '@open-loops/contracts';
import { titleCase } from '../format.js';

/** Coarse on purpose: a delivery is interesting as "this morning" or "a week ago", not to the minute. */
const ago = (at: number): string => {
  const hours = Math.max(0, Math.round((Date.now() - at) / 3_600_000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${String(hours)}h ago`;
  return `${String(Math.round(hours / 24))}d ago`;
};

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-signal-done',
  PENDING: 'text-signal-progress',
  AWAITING_SETUP: 'text-signal-progress',
  EXPIRED: 'text-signal-progress',
  FAILED: 'text-signal-unconfirmed',
  DISCONNECTED: 'text-chalk-600',
};

interface IntegrationCardProps {
  readonly integration: IntegrationDto;
  readonly pending: boolean;
  readonly onConnect: (provider: string) => void;
  readonly onDisconnect: (provider: string) => void;
  /** Takes the person to the panel that answers the source's outstanding question. */
  readonly onFinishSetup: (provider: string) => void;
}

export function IntegrationCard({
  integration,
  pending,
  onConnect,
  onDisconnect,
  onFinishSetup,
}: IntegrationCardProps): React.ReactElement {
  const active = integration.status === 'ACTIVE';
  const awaitingSetup = integration.status === 'AWAITING_SETUP';
  const pushed = integration.delivery === 'PUSH';
  return (
    <div className="hairline flex flex-col justify-between rounded-lg bg-ink-900/60 p-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-medium">{titleCase(integration.provider)}</h2>
          <span
            className={`font-mono text-[10px] tracking-[0.14em] uppercase ${
              STATUS_TONE[integration.status] ?? 'text-chalk-600'
            }`}
          >
            {awaitingSetup ? 'needs a choice' : integration.status.toLowerCase()}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-chalk-600">
          {integration.accountLabel ?? integration.mode.toLowerCase().replace('_', ' ')}
        </p>
        {integration.lastSyncedAt !== undefined && (
          <p className="mt-1 font-mono text-[11px] text-chalk-600">
            {pushed ? 'delivered' : 'synced'} {ago(integration.lastSyncedAt)}
          </p>
        )}
        {integration.lastError !== undefined && (
          <p className="mt-2 text-[11px] text-signal-unconfirmed">{integration.lastError}</p>
        )}
      </div>

      <div className="mt-5">
        <CardAction
          integration={integration}
          pending={pending}
          active={active}
          awaitingSetup={awaitingSetup}
          pushed={pushed}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onFinishSetup={onFinishSetup}
        />
      </div>
    </div>
  );
}

/**
 * A stand-in with the card's exact geometry, so the first paint shows the real grid rather
 * than an empty page and nothing jumps when the request lands.
 */
export function IntegrationCardSkeleton(): React.ReactElement {
  return (
    <div
      aria-hidden="true"
      className="hairline flex animate-pulse flex-col justify-between rounded-lg bg-ink-900/60 p-5"
    >
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="h-[15px] w-24 rounded bg-ink-800" />
          <span className="h-[10px] w-14 rounded bg-ink-800" />
        </div>
        <span className="mt-2 block h-[11px] w-20 rounded bg-ink-800" />
      </div>
      <div className="mt-5 h-[26px] w-full rounded border border-ink-700" />
    </div>
  );
}

interface CardActionProps extends IntegrationCardProps {
  readonly active: boolean;
  readonly awaitingSetup: boolean;
  readonly pushed: boolean;
}

/**
 * The one control a card offers, which is a different control in each of four states. Extracted
 * from the card itself so neither half has to be read with the other in mind.
 */
function CardAction({
  integration,
  pending,
  active,
  awaitingSetup,
  pushed,
  onConnect,
  onDisconnect,
  onFinishSetup,
}: CardActionProps): React.ReactElement {
  return (
    <>
        {/*
         * A push source has no button of any kind. There is nothing to authorise — the local
         * agent posts its recaps to /api/agent/ingest — so the honest thing to show is how it
         * arrives. It used to read "No adapter yet", which said the opposite of the truth: that
         * somebody had not got round to writing one.
         */}
        {pushed ? (
          <p className="text-[11px] leading-relaxed text-chalk-600">
            {active
              ? 'Arrives by push from the local agent.'
              : 'Arrives by push. Nothing has been delivered yet.'}
          </p>
        ) : awaitingSetup ? (
          /*
           * Authorised, and deliberately not finished. The token is real but the source still
           * needs the one answer that decides what it fetches, and a card that said "active"
           * here would be describing a sync nobody has scoped yet.
           */
          <>
            <p className="mb-2 text-[11px] leading-relaxed text-chalk-500">
              {integration.setupLabel ?? 'One more choice before this can sync.'}
            </p>
            <button
              type="button"
              onClick={() => {
                onFinishSetup(integration.provider);
              }}
              className="min-h-10 w-full rounded border border-chalk-600 py-1.5 text-[11px] text-chalk-100 sm:min-h-0 transition hover:bg-ink-800"
            >
              Finish setup
            </button>
          </>
        ) : active ? (
          <button
            type="button"
            onClick={() => {
              onDisconnect(integration.provider);
            }}
            className="min-h-10 w-full rounded border border-ink-700 py-1.5 text-[11px] text-chalk-500 sm:min-h-0 transition hover:border-ink-600 hover:text-chalk-100"
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            disabled={!integration.connectable || pending}
            onClick={() => {
              onConnect(integration.provider);
            }}
            className="min-h-10 w-full rounded border border-chalk-600 py-1.5 text-[11px] text-chalk-100 sm:min-h-0 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
          >
            {pending ? 'Opening consent…' : integration.connectable ? 'Connect' : 'No adapter yet'}
          </button>
        )}
    </>
  );
}
