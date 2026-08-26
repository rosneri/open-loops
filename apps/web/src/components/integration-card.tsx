import type { IntegrationDto } from '@open-loops/contracts';
import { titleCase } from '../format.js';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'text-signal-done',
  PENDING: 'text-signal-progress',
  EXPIRED: 'text-signal-progress',
  FAILED: 'text-signal-unconfirmed',
  DISCONNECTED: 'text-chalk-600',
};

interface IntegrationCardProps {
  readonly integration: IntegrationDto;
  readonly pending: boolean;
  readonly onConnect: (provider: string) => void;
  readonly onDisconnect: (provider: string) => void;
}

export function IntegrationCard({
  integration,
  pending,
  onConnect,
  onDisconnect,
}: IntegrationCardProps): React.ReactElement {
  const active = integration.status === 'ACTIVE';
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
            {integration.status.toLowerCase()}
          </span>
        </div>
        <p className="mt-1 font-mono text-[11px] text-chalk-600">
          {integration.accountLabel ?? integration.mode.toLowerCase().replace('_', ' ')}
        </p>
        {integration.lastError !== undefined && (
          <p className="mt-2 text-[11px] text-signal-unconfirmed">{integration.lastError}</p>
        )}
      </div>

      <div className="mt-5">
        {active ? (
          <button
            type="button"
            onClick={() => {
              onDisconnect(integration.provider);
            }}
            className="w-full rounded border border-ink-700 py-1.5 text-[11px] text-chalk-500 transition hover:border-ink-600 hover:text-chalk-100"
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
            className="w-full rounded border border-chalk-600 py-1.5 text-[11px] text-chalk-100 transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:border-ink-700 disabled:text-chalk-600"
          >
            {pending ? 'Opening consent…' : integration.connectable ? 'Connect' : 'No adapter yet'}
          </button>
        )}
      </div>
    </div>
  );
}
