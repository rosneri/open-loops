/**
 * The port lives in orchestration now, so that plugins can ask for a model without naming a
 * provider. Re-exported here so the adapters in this library keep reading the way they did.
 */
export type { StructuredGenerator, StructuredRequest } from '@open-loops/orchestration';
