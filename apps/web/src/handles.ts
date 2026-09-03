/**
 * The handles field is one text box holding a list, which means two representations of the same
 * thing: the list the server stores, and the half-finished line someone is currently typing.
 * Keeping them apart is the whole job here.
 *
 * The field used to render `value.join(', ')` straight back into a controlled input while
 * parsing every keystroke. That round trip deletes any character the parse throws away, so the
 * moment you typed a comma it vanished — along with the space after it — and a second handle
 * could not be entered at all.
 */

/** The list a line of text means. Blank entries are separators, not handles. */
export const parseHandles = (raw: string): readonly string[] =>
  raw
    .split(',')
    .map((handle) => handle.trim())
    .filter((handle) => handle.length > 0);

const sameHandles = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((handle, index) => handle === right[index]);

/**
 * What the box shows, given what the server holds and what has been typed into it.
 *
 * While the two agree the typed text wins verbatim, so punctuation being typed survives being
 * echoed through the parent: `"me@work.com,"` still means `['me@work.com']`, so the trailing
 * comma is left alone and there is somewhere to type the next handle. When they disagree the
 * saved value wins, which is what makes a load, a save or a discarded draft show up in the box.
 */
export const handlesText = (value: readonly string[], typed: string): string =>
  sameHandles(value, parseHandles(typed)) ? typed : value.join(', ');
