import { describe, expect, it } from 'vitest';
import { handlesText, parseHandles } from './handles.js';

/**
 * Types a line one character at a time through the same loop the component runs: each keystroke
 * is parsed, the parsed list becomes the parent's value, and the box then re-renders from both.
 * Returns what the box ends up showing, which is the thing that was broken.
 */
const type = (line: string): string => {
  let value: readonly string[] = [];
  let typed = '';
  let shown = '';
  for (const character of line) {
    // The user appends to what is on screen, not to what was last stored.
    typed = shown + character;
    value = parseHandles(typed);
    shown = handlesText(value, typed);
  }
  return shown;
};

describe('typing into the handles field', () => {
  /** The reported bug: the comma was parsed away and echoed back as nothing. */
  it('keeps a comma that has just been typed', () => {
    expect(type('me@work.com,')).toBe('me@work.com,');
  });

  it('keeps the space after the comma, so the next handle can be started', () => {
    expect(type('me@work.com, ')).toBe('me@work.com, ');
  });

  it('lets a second handle be typed at all', () => {
    expect(type('me@work.com, @me')).toBe('me@work.com, @me');
    expect(parseHandles(type('me@work.com, @me'))).toEqual(['me@work.com', '@me']);
  });

  it('survives a third one and a trailing separator', () => {
    expect(type('a@b.com, @c, d-login,')).toBe('a@b.com, @c, d-login,');
  });
});

describe('what the box shows', () => {
  it('shows the saved handles when nothing has been typed over them', () => {
    expect(handlesText(['a@b.com', '@c'], 'a@b.com, @c')).toBe('a@b.com, @c');
  });

  it('leaves punctuation alone while it still parses to the saved value', () => {
    expect(handlesText(['a@b.com'], 'a@b.com,')).toBe('a@b.com,');
    expect(handlesText(['a@b.com'], '  a@b.com  ')).toBe('  a@b.com  ');
  });

  /** A load, a save, or a discarded draft has to reach the box; the typed line is stale then. */
  it('adopts a value that arrived from somewhere other than the keyboard', () => {
    expect(handlesText(['fresh@from.server'], 'stale')).toBe('fresh@from.server');
    expect(handlesText(['a@b.com', '@c'], 'a@b.com')).toBe('a@b.com, @c');
  });

  it('shows an empty box when there are no handles and nothing typed', () => {
    expect(handlesText([], '')).toBe('');
  });

  it('lets the last handle be deleted rather than restoring it', () => {
    expect(handlesText([], '')).toBe('');
    expect(type('a')).toBe('a');
  });
});

describe('parseHandles', () => {
  it('trims, and treats blanks between commas as separators rather than handles', () => {
    expect(parseHandles('a@b.com, , @c,')).toEqual(['a@b.com', '@c']);
    expect(parseHandles('')).toEqual([]);
    expect(parseHandles(',,,')).toEqual([]);
  });
});
