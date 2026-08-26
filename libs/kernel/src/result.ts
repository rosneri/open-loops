export class DomainError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export type Result<TValue, TError = DomainError> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };

export const ok = <TValue>(value: TValue): Result<TValue, never> => ({ ok: true, value });
export const err = <TError>(error: TError): Result<never, TError> => ({ ok: false, error });

export const unwrap = <TValue>(result: Result<TValue>): TValue => {
  if (!result.ok) throw result.error;
  return result.value;
};
