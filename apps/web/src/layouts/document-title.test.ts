import { describe, expect, it } from 'vitest';
import { documentTitleForPath } from './document-title';

describe('documentTitleForPath', () => {
  it.each([
    ['/ui/0', 'Data Marts · OWOX'],
    ['/ui/0/data-marts', 'Data Marts · OWOX'],
    ['/ui/0/data-marts/models', 'Models · OWOX'],
    ['/ui/0/data-marts/reports', 'Reports · OWOX'],
    ['/ui/0/data-marts/insights', 'Insights · OWOX'],
    ['/ui/0/data-marts/schedules', 'Triggers · OWOX'],
    ['/ui/0/data-marts/runs', 'Run History · OWOX'],
    ['/ui/0/data-marts/create', 'New Data Mart · OWOX'],
    ['/ui/0/data-marts/mart-1/overview', 'Data Mart · OWOX'],
    ['/ui/0/data-destinations', 'Destinations · OWOX'],
    ['/ui/0/credentials', 'Credentials · OWOX'],
    ['/ui/0/search', 'Search · OWOX'],
    ['/ui/0/project-settings/members', 'Project settings · OWOX'],
    ['/ui/me/profile', 'My profile · OWOX'],
    ['/ui/me/projects', 'Projects · OWOX'],
    ['/somewhere-else', 'OWOX'],
  ])('%s', (pathname, title) => {
    expect(documentTitleForPath(pathname)).toBe(title);
  });
});
