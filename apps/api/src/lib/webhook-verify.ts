import { createHmac, timingSafeEqual } from 'node:crypto';

// Constant-time comparison wrapper that tolerates length mismatch.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Meta / WhatsApp Cloud signature: X-Hub-Signature-256: "sha256=<hex>"
// over the raw request body.
export function verifyMetaSignature(args: {
  appSecret: string;
  rawBody: string | Buffer;
  signatureHeader: string | undefined;
}): boolean {
  if (!args.signatureHeader || !args.signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const provided = args.signatureHeader.slice('sha256='.length);
  const expected = createHmac('sha256', args.appSecret)
    .update(args.rawBody)
    .digest('hex');
  return safeEqual(provided, expected);
}

// Twilio signature: HMAC-SHA1 over (full URL + form params sorted by key,
// concatenated as key + value), base64 encoded. The full URL must be the
// EXACT URL Twilio called (including query string and scheme), which is why
// callers must reconstruct it from x-forwarded-proto + host + originalUrl.
export function verifyTwilioSignature(args: {
  authToken: string;
  url: string;
  params: Record<string, string>;
  signatureHeader: string | undefined;
}): boolean {
  if (!args.signatureHeader) return false;
  const sortedKeys = Object.keys(args.params).sort();
  let payload = args.url;
  for (const key of sortedKeys) {
    payload += key + (args.params[key] ?? '');
  }
  const expected = createHmac('sha1', args.authToken).update(payload).digest('base64');
  return safeEqual(args.signatureHeader, expected);
}

// Telegram webhook secret_token: simple equality on header value.
export function verifyTelegramSecretToken(args: {
  expected: string;
  header: string | undefined;
}): boolean {
  if (!args.header) return false;
  return safeEqual(args.header, args.expected);
}

// Postmark inbound auth: Basic <base64(user:password)>.
export function verifyBasicAuth(args: {
  user: string;
  password: string;
  header: string | undefined;
}): boolean {
  if (!args.header || !args.header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(args.header.slice('Basic '.length), 'base64').toString('utf8');
  const [user, ...rest] = decoded.split(':');
  const password = rest.join(':');
  return user === args.user && safeEqual(password, args.password);
}
