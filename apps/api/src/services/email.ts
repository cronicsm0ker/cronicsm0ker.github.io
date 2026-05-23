import type { Logger } from '../logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  send: (message: EmailMessage) => Promise<void>;
}

// Phase 0 stub: writes the message to the log so password-reset URLs
// can be copied during local development. Replaced by Resend/Postmark
// in Phase 1.
export function createConsoleEmailProvider(logger: Logger): EmailProvider {
  return {
    async send(message) {
      logger.warn(
        { email: { to: message.to, subject: message.subject, body: message.text } },
        'EMAIL STUB — would send email',
      );
    },
  };
}
