import { useState } from 'react';
import { handlesText, parseHandles } from '../handles.js';

interface HandlesFieldProps {
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
}

/**
 * The addresses and usernames that make a message *to you* rather than about you. They belong to
 * the account and nobody else's: this is the difference between "you promised to reply" and a
 * promise somebody else made in a thread you happen to be in.
 *
 * One line, comma separated, because that is how people already write a list of addresses. The
 * line being typed is held here rather than reconstructed from the parsed list on every render:
 * see `handlesText` for why a controlled input cannot round-trip through the parse.
 */
export function HandlesField({ value, onChange }: HandlesFieldProps): React.ReactElement {
  const [typed, setTyped] = useState(() => value.join(', '));

  return (
    <div>
      <label className="block text-[11px] tracking-[0.14em] text-chalk-600 uppercase">
        Your handles
        <input
          type="text"
          spellCheck={false}
          value={handlesText(value, typed)}
          placeholder="you@work.com, @you, your-github-login"
          onChange={(event) => {
            setTyped(event.target.value);
            onChange(parseHandles(event.target.value));
          }}
          className="mt-2 w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-base sm:text-sm tracking-normal text-chalk-100 normal-case outline-none focus:border-chalk-600 placeholder:text-chalk-700"
        />
      </label>

      <p className="mt-2 text-[11px] text-chalk-500">
        Email addresses and usernames you go by on the apps you connected, separated by commas.{' '}
        <span className="text-chalk-600">
          A signal counts as directed at you when one of these is on it. Your sign-in name always
          counts and does not need to be listed.
        </span>
      </p>
    </div>
  );
}
