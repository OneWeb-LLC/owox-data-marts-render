import { describe, expect, it } from 'vitest';
import { apiErrorMessage } from './extract-api-error.util';

describe('apiErrorMessage', () => {
  it('shows validator sentences instead of the generic request failure', () => {
    const error = {
      response: {
        data: {
          message: 'Request validation failed',
          details: {
            errors: [
              { message: 'name should not be empty.' },
              { message: 'title should not be empty.' },
            ],
          },
        },
      },
    };
    expect(apiErrorMessage(error, 'Failed to publish')).toBe(
      'name should not be empty. title should not be empty.'
    );
  });

  it('keeps a specific server message', () => {
    const error = { response: { data: { message: 'Storage is unhealthy.' } } };
    expect(apiErrorMessage(error, 'Failed')).toBe('Storage is unhealthy.');
  });
});
