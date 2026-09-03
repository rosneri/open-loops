/**
 * Where a browser is sent once a connection handshake ends, and the one place that decides it.
 *
 * It lives apart from the controller because it is the security-relevant half of that route:
 * `returnTo` arrives in a query string and leaves in a `Location` header, which is an open
 * redirect unless something checks it. A function is testable; a private method reached only
 * through a Nest controller is not.
 */
export interface ReturnUrlInput {
  /** The caller's requested landing page. Untrusted: it comes off a URL anyone can write. */
  readonly returnTo: string | undefined;
  /** This deployment's public origin, with no trailing slash. */
  readonly site: string;
  readonly provider: string;
}

/**
 * A `returnTo` this deployment is willing to send a browser to: its own pages, nobody else's.
 * A relative path resolves against the site and therefore stays on it; an absolute URL keeps
 * whatever origin it was given, which is then compared rather than trusted.
 */
const sameSite = (returnTo: string | undefined, site: string): string | undefined => {
  if (returnTo === undefined || returnTo.trim().length === 0) return undefined;
  try {
    const resolved = new URL(returnTo, `${site}/`);
    return resolved.origin === new URL(site).origin ? resolved.toString() : undefined;
  } catch {
    // An unparseable `returnTo` is not an error worth failing a finished OAuth handshake over.
    return undefined;
  }
};

export const resolveReturnUrl = (input: ReturnUrlInput): string => {
  const base = sameSite(input.returnTo, input.site) ?? `${input.site}/integrations`;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}provider=${encodeURIComponent(input.provider)}`;
};
