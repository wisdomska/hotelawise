import { describe, expect, it } from 'vitest';
import { previewGate } from '@/server/platform/preview-gate';

const req = (pathname: string, auth?: string) => ({ nextUrl: { pathname }, headers: new Headers(auth ? { authorization: auth } : {}) });
const basic = (pw: string) => `Basic ${btoa(`anyone:${pw}`)}`;
const cfg = { appEnv: 'preview', password: 'akwaaba-staging' };

describe('preview gate', () => {
  it('does nothing outside preview', () => {
    expect(previewGate(req('/'), { appEnv: 'production', password: 'x' })).toBeNull();
    expect(previewGate(req('/'), { appEnv: 'development' })).toBeNull();
  });
  it('challenges without the right password, and fails closed when none is set', () => {
    expect(previewGate(req('/'), cfg)?.status).toBe(401);
    expect(previewGate(req('/'), cfg)?.headers.get('www-authenticate')).toMatch(/Basic/);
    expect(previewGate(req('/', basic('wrong')), cfg)?.status).toBe(401);
    expect(previewGate(req('/', 'Basic !!!notbase64'), cfg)?.status).toBe(401);
    expect(previewGate(req('/', 'Bearer x'), cfg)?.status).toBe(401);
    expect(previewGate(req('/', basic('anything')), { appEnv: 'preview' })?.status).toBe(401);
  });
  it('lets the right password through', () => {
    expect(previewGate(req('/admin', basic('akwaaba-staging')), cfg)).toBeNull();
  });
  it('keeps the Paystack webhook and health check reachable', () => {
    expect(previewGate(req('/api/paystack/webhook'), cfg)).toBeNull();
    expect(previewGate(req('/api/health'), cfg)).toBeNull();
  });
});
