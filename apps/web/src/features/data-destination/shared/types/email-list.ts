const EMAIL_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One sentence for the email list, or null when every entry is a usable address.
 *
 * The issue belongs on the list itself. A failure on `to.0` turns the label red and leaves the
 * message off the field the person is looking at.
 */
export function emailListIssue(value: unknown, emptyMessage: string): string | null {
  if (!Array.isArray(value) || value.length === 0) return emptyMessage;
  const emails: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return emptyMessage;
    emails.push(item);
  }
  const invalid = emails.filter(email => !EMAIL_ADDRESS.test(email));
  if (invalid.length === 1) {
    return `"${invalid[0]}" is not a valid email address`;
  }
  if (invalid.length > 1) {
    return `These are not valid email addresses: ${invalid.join(', ')}`;
  }
  return null;
}
