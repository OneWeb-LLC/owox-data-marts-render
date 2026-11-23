import { describe, expect, it } from 'vitest';
import { emailListIssue } from './email-list';

const EMPTY = 'Add at least one email address';

describe('emailListIssue', () => {
  it('asks for an address when the list is missing or empty', () => {
    expect(emailListIssue(undefined, EMPTY)).toBe(EMPTY);
    expect(emailListIssue([], EMPTY)).toBe(EMPTY);
  });

  it('names an address that is not an email', () => {
    expect(emailListIssue(['not-an-email'], EMPTY)).toBe(
      '"not-an-email" is not a valid email address'
    );
    expect(emailListIssue(['a@example.com', 'nope'], EMPTY)).toBe(
      '"nope" is not a valid email address'
    );
    expect(emailListIssue(['nope', 'also-nope'], EMPTY)).toBe(
      'These are not valid email addresses: nope, also-nope'
    );
  });

  it('accepts a list of email addresses', () => {
    expect(emailListIssue(['a@example.com', 'b@example.com'], EMPTY)).toBeNull();
  });
});
