import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyBasicAuth,
  verifyMetaSignature,
  verifyTelegramSecretToken,
  verifyTwilioSignature,
} from './webhook-verify.js';

describe('verifyMetaSignature', () => {
  const appSecret = 'test-meta-secret';
  const body = '{"object":"page","entry":[]}';
  const sig =
    'sha256=' + createHmac('sha256', appSecret).update(body).digest('hex');

  it('accepts a valid sha256 signature', () => {
    expect(verifyMetaSignature({ appSecret, rawBody: body, signatureHeader: sig })).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(
      verifyMetaSignature({ appSecret, rawBody: body + 'x', signatureHeader: sig }),
    ).toBe(false);
  });

  it('rejects missing header', () => {
    expect(verifyMetaSignature({ appSecret, rawBody: body, signatureHeader: undefined })).toBe(
      false,
    );
  });

  it('rejects non-sha256 prefix', () => {
    expect(
      verifyMetaSignature({
        appSecret,
        rawBody: body,
        signatureHeader: 'md5=deadbeef',
      }),
    ).toBe(false);
  });
});

describe('verifyTwilioSignature', () => {
  const authToken = 'twilio-test-token';
  const url = 'https://api.example.com/webhooks/twilio-sms?token=abc';
  const params = { Body: 'hi', From: '+14155552671', To: '+14155550000', MessageSid: 'SM123' };

  function sign(p: Record<string, string>): string {
    const sorted = Object.keys(p).sort();
    let payload = url;
    for (const k of sorted) payload += k + (p[k] ?? '');
    return createHmac('sha1', authToken).update(payload).digest('base64');
  }

  it('accepts a valid signature', () => {
    expect(
      verifyTwilioSignature({ authToken, url, params, signatureHeader: sign(params) }),
    ).toBe(true);
  });

  it('rejects an altered param', () => {
    const tampered = { ...params, Body: 'evil' };
    expect(
      verifyTwilioSignature({ authToken, url, params: tampered, signatureHeader: sign(params) }),
    ).toBe(false);
  });
});

describe('verifyTelegramSecretToken', () => {
  it('accepts matching tokens', () => {
    expect(verifyTelegramSecretToken({ expected: 'abc123xyz', header: 'abc123xyz' })).toBe(true);
  });
  it('rejects mismatched tokens', () => {
    expect(verifyTelegramSecretToken({ expected: 'abc123xyz', header: 'wrong' })).toBe(false);
  });
  it('rejects missing header', () => {
    expect(verifyTelegramSecretToken({ expected: 'abc123xyz', header: undefined })).toBe(false);
  });
});

describe('verifyBasicAuth', () => {
  const header = 'Basic ' + Buffer.from('user:pass:with:colons').toString('base64');
  it('accepts matching basic auth', () => {
    expect(verifyBasicAuth({ user: 'user', password: 'pass:with:colons', header })).toBe(true);
  });
  it('rejects wrong password', () => {
    expect(verifyBasicAuth({ user: 'user', password: 'nope', header })).toBe(false);
  });
  it('rejects missing or malformed header', () => {
    expect(verifyBasicAuth({ user: 'user', password: 'pass', header: undefined })).toBe(false);
    expect(verifyBasicAuth({ user: 'user', password: 'pass', header: 'Bearer xyz' })).toBe(false);
  });
});
