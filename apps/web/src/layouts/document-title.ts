const SECTION_TITLES: readonly [RegExp, string][] = [
  [/\/data-destinations(?:\/|$)/, 'Destinations'],
  [/\/data-marts\/create(?:\/|$)/, 'New Data Mart'],
  [/\/data-marts\/models(?:\/|$)/, 'Models'],
  [/\/data-marts\/reports(?:\/|$)/, 'Reports'],
  [/\/data-marts\/insights(?:\/|$)/, 'Insights'],
  [/\/data-marts\/schedules(?:\/|$)/, 'Triggers'],
  [/\/data-marts\/runs(?:\/|$)/, 'Run History'],
  [/\/data-marts\/[^/]+(?:\/|$)/, 'Data Mart'],
  [/\/data-marts(?:\/|$)/, 'Data Marts'],
  [/\/credentials(?:\/|$)/, 'Credentials'],
  [/\/search(?:\/|$)/, 'Search'],
  [/\/project-settings(?:\/|$)/, 'Project settings'],
  [/\/pricing(?:\/|$)/, 'Pricing'],
  [/\/notifications(?:\/|$)/, 'Notifications'],
  [/\/me\/api-keys(?:\/|$)/, 'API keys'],
  [/\/plugins(?:\/|$)/, 'Plugins'],
  [/\/about(?:\/|$)/, 'About'],
  [/\/request-access(?:\/|$)/, 'Request access'],
  [/\/ui\/me\/projects(?:\/|$)/, 'Projects'],
  [/\/ui\/me\/email-preferences(?:\/|$)/, 'Email preferences'],
  [/\/ui\/me(?:\/|$)/, 'My profile'],
  [/\/data-storages(?:\/|$)/, 'Storages'],
  [/\/connectors(?:\/|$)/, 'Connectors'],
];

/** Browser tab title for an app path. The project home is the Data Marts list. */
export function documentTitleForPath(pathname: string): string {
  if (/^\/ui\/[^/]+\/?$/.test(pathname)) return 'Data Marts · OWOX';
  const match = SECTION_TITLES.find(([pattern]) => pattern.test(pathname));
  return match ? `${match[1]} · OWOX` : 'OWOX';
}
