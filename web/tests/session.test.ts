import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_MAX_AGE, checkPassword, createSessionToken, verifySessionToken } from '@/lib/auth/session';

beforeEach(() => {
  process.env.SESSION_SECRET = 'a-very-long-session-secret';
  process.env.ADMIN_PASSWORD = 'mat-khau';
});

describe('session token', () => {
  it('token vừa tạo hợp lệ', () => {
    expect(verifySessionToken(createSessionToken())).toBe(true);
  });

  it('hết hạn sau 30 ngày', () => {
    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now + (SESSION_MAX_AGE - 60) * 1000)).toBe(true);
    expect(verifySessionToken(token, now + (SESSION_MAX_AGE + 60) * 1000)).toBe(false);
  });

  it('bị sửa hoặc sai định dạng → không hợp lệ', () => {
    const [exp, sig] = createSessionToken().split('.');
    expect(verifySessionToken(`${Number(exp) + 1000}.${sig}`)).toBe(false);
    expect(verifySessionToken(`${exp}.x${sig}`)).toBe(false);
    expect(verifySessionToken('rác')).toBe(false);
    expect(verifySessionToken('')).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it('đổi SESSION_SECRET → token cũ mất hiệu lực', () => {
    const token = createSessionToken();
    process.env.SESSION_SECRET = 'another-long-session-secret';
    expect(verifySessionToken(token)).toBe(false);
  });

  it('SESSION_SECRET ngắn hơn 16 ký tự → ném lỗi rõ ràng', () => {
    process.env.SESSION_SECRET = 'short';
    expect(() => createSessionToken()).toThrow('SESSION_SECRET');
  });
});

describe('checkPassword', () => {
  it('đúng / sai / chưa đặt mật khẩu', () => {
    expect(checkPassword('mat-khau')).toBe(true);
    expect(checkPassword('sai')).toBe(false);
    process.env.ADMIN_PASSWORD = '';
    expect(checkPassword('')).toBe(false);
  });
});
