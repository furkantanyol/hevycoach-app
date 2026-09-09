import { proStatusFrom } from './pro-status';

describe('proStatusFrom', () => {
  it('should report Pro when user info returns 200', () => {
    expect(proStatusFrom({ kind: 'status', status: 200 })).toBe('pro');
  });

  it('should report not Pro when the key is rejected with 401', () => {
    expect(proStatusFrom({ kind: 'status', status: 401 })).toBe('not-pro');
  });

  it('should report not Pro when the key is refused with 403', () => {
    expect(proStatusFrom({ kind: 'status', status: 403 })).toBe('not-pro');
  });

  it('should report unknown when the request never reached Hevy', () => {
    expect(proStatusFrom({ kind: 'network-error' })).toBe('unknown');
  });

  it('should report unknown when Hevy itself fails, so an outage cannot lock a paying user out', () => {
    expect(proStatusFrom({ kind: 'status', status: 503 })).toBe('unknown');
  });

  it('should report unknown when the check is rate limited', () => {
    expect(proStatusFrom({ kind: 'status', status: 429 })).toBe('unknown');
  });
});
