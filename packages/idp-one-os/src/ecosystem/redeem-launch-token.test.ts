import { buildOwebConstellationSignInUrl } from './redeem-launch-token.js';

describe('buildOwebConstellationSignInUrl', () => {
  it('sets launch and strips redirect params', () => {
    const url = buildOwebConstellationSignInUrl(
      'https://oweb.one/login?redirect_to=https%3A%2F%2Fwrong',
      'ometrics'
    );
    expect(url).toBe('https://oweb.one/login?launch=ometrics');
  });
});