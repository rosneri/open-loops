/**
 * Routes, described without naming a framework. A library that imported Nest would drag the
 * container into every plugin and make a second client — a CLI, an MCP server — impossible to
 * build against the same contract. The host is the only thing that knows what a controller is.
 */
export type HttpControllerClass = new (...args: never[]) => unknown;

export interface HttpRegistration {
  /**
   * The route prefix these controllers own, without a leading slash — `api/podcast`. It has to
   * match what the controllers themselves declare; stating it here is what lets the host refuse
   * two plugins that would otherwise quietly fight over the same path.
   */
  readonly basePath: string;
  readonly controllers: readonly HttpControllerClass[];
  /** Injectables the controllers need. Opaque here; the host binds them. */
  readonly providers?: readonly unknown[];
}

export interface HttpRegistry {
  register(registration: HttpRegistration): void;
}
