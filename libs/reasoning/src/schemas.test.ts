import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { extractionResultSchema, reconciliationResultSchema } from './schemas.js';

/**
 * Anthropic compiles structured output into a grammar and gives up on objects with too many
 * optional siblings — a probe draft with thirteen of them was rejected outright as "Schema is
 * too complex", which took a production tick down. Empirically fourteen fails and ten passes,
 * so this guards well below the line.
 */
const MAX_OPTIONAL_SIBLINGS = 10;

interface JsonSchemaNode {
  readonly type?: string;
  readonly properties?: Record<string, JsonSchemaNode>;
  readonly required?: readonly string[];
  readonly items?: JsonSchemaNode;
}

const objectsIn = (node: JsonSchemaNode, path = '$'): readonly [string, JsonSchemaNode][] => {
  const here: [string, JsonSchemaNode][] =
    node.properties === undefined ? [] : [[path, node]];
  const children = Object.entries(node.properties ?? {}).flatMap(([key, child]) =>
    objectsIn(child, `${path}.${key}`),
  );
  const items = node.items === undefined ? [] : objectsIn(node.items, `${path}[]`);
  return [...here, ...children, ...items];
};

const optionalCount = (node: JsonSchemaNode): number =>
  Object.keys(node.properties ?? {}).filter((key) => !(node.required ?? []).includes(key)).length;

describe.each([
  ['extraction', extractionResultSchema],
  ['reconciliation', reconciliationResultSchema],
])('%s schema', (_name, schema) => {
  const root = z.toJSONSchema(schema, { io: 'output' }) as JsonSchemaNode;

  it('keeps optional siblings under the limit that breaks structured output', () => {
    const offenders = objectsIn(root)
      .map(([path, node]) => ({ path, optional: optionalCount(node) }))
      .filter((entry) => entry.optional > MAX_OPTIONAL_SIBLINGS);

    expect(offenders).toEqual([]);
  });

  it('describes an object at the root', () => {
    expect(root.type).toBe('object');
  });
});
