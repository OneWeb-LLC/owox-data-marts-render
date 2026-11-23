import type { ApiError, ApiFieldError } from './api-error.interface.ts';
import type { AxiosError } from 'axios';

/**
 * Null-safe at RUNTIME: callers pass whatever `catch` handed them, and a rejection that is not an
 * Axios error at all — or is `undefined`, which the 5xx toast passes deliberately — must fall back
 * to the caller's message rather than throw a TypeError inside the error handler.
 *
 * Returns an EMPTY object rather than `undefined` when there is nothing to extract, which is what
 * makes the non-optional return type honest: a dozen call sites read `.message` off this without
 * `?.`, so handing them `undefined` would throw inside the very handler meant to report a failure.
 * Their `?? fallback` then does what it already looks like it does.
 */
export const extractApiError = (error: unknown): ApiError => {
  return ((error as AxiosError | undefined)?.response?.data ?? {}) as ApiError;
};

/**
 * The message to show a user for a failed request: the server's own sentence when there is one,
 * the thrown error's message otherwise, and `fallback` when neither says anything.
 *
 * The middle step is what a bare `e instanceof Error ? e.message : fallback` gets you, and on an
 * Axios rejection that is only "Request failed with status code 400" — the refusal the backend
 * wrote for a human is in the body, not on the error. Reading the body first is what
 * `showApiErrorToast` already does for the toasts the interceptor raises; this is the same
 * precedence for the call sites that render the message themselves.
 */
function validationDetailText(error: unknown): string | null {
  const errors = extractApiError(error).details?.errors;
  if (!Array.isArray(errors)) return null;
  const parts = errors
    .map(entry => (typeof entry.message === 'string' ? entry.message.trim() : ''))
    .filter(part => part.length > 0);
  const unique = [...new Set(parts)];
  if (unique.length === 0) return null;
  const shown = unique.slice(0, 3);
  const hidden = unique.length - shown.length;
  return hidden > 0 ? `${shown.join(' ')} (+${hidden} more)` : shown.join(' ');
}

export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const serverMessage = extractApiError(error).message?.trim() ?? '';
  const details = validationDetailText(error);
  if (details && (!serverMessage || serverMessage === 'Request validation failed')) return details;
  if (details && !serverMessage.includes(details)) return `${serverMessage} ${details}`;
  if (serverMessage) return serverMessage;
  const thrownMessage = error instanceof Error ? error.message.trim() : '';
  return thrownMessage || fallback;
};

/**
 * The per-input errors a rejected save names (`errorDetails.fieldErrors`), or an empty list.
 * Shape-checked entry by entry: this runs inside an error handler, and a malformed body must
 * leave the form as it was rather than throw on top of the failure it is reporting.
 */
export const extractApiFieldErrors = (error: unknown): ApiFieldError[] => {
  const fieldErrors: unknown = extractApiError(error).errorDetails?.fieldErrors;
  if (!Array.isArray(fieldErrors)) return [];
  return fieldErrors.filter(
    (entry): entry is ApiFieldError =>
      typeof (entry as ApiFieldError | null)?.field === 'string' &&
      typeof (entry as ApiFieldError | null)?.message === 'string'
  );
};
