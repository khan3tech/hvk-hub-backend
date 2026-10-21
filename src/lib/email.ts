import { logger } from "./logger.js";

// Outbound email behind one small interface (006-notifications research.md R2). The default
// sender only logs (no provider is configured in this repo yet); swap in an SMTP/SES sender via
// setEmailSender() at startup when one is chosen. Callers must treat send failures as non-fatal.
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class LogEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    // Never log the body: it can carry personal data (leave reasons, payroll details).
    logger.info({ to: message.to, subject: message.subject }, "email (log sender, not delivered)");
  }
}

let sender: EmailSender = new LogEmailSender();

export function setEmailSender(next: EmailSender): void {
  sender = next;
}

export function getEmailSender(): EmailSender {
  return sender;
}
