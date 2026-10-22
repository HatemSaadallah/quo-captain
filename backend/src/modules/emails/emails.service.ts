import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../../common/interfaces/auth.interface';
import { QuotationsService } from '../quotations/quotations.service';

export interface SendEmailDto {
  quotationId: string;
  to: string[];
  subject: string;
  body: string;
  attachPdf?: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sends quotation emails through Resend (https://resend.com), with the ELENCO COSTI PDF attached. */
@Injectable()
export class EmailsService {
  private readonly log = new Logger(EmailsService.name);
  constructor(private readonly quotations: QuotationsService) {}

  async send(input: SendEmailDto, user: AuthUser): Promise<{ id: string; to: string[] }> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) throw new ServiceUnavailableException('Email sending is not configured. Set RESEND_API_KEY in the backend environment.');
    const to = [...new Set((Array.isArray(input.to) ? input.to : []).map((e) => String(e).trim()).filter(Boolean))];
    if (!to.length) throw new BadRequestException('Add at least one recipient.');
    if (to.length > 20) throw new BadRequestException('Send to at most 20 recipients at a time.');
    const bad = to.filter((e) => !EMAIL.test(e) || /\.local$/i.test(e));
    if (bad.length) throw new BadRequestException(`These addresses cannot receive email: ${bad.join(', ')}. Directory contacts use demo .local addresses; type a real address instead.`);
    const subject = String(input.subject ?? '').trim();
    const body = String(input.body ?? '').trim();
    if (!subject || subject.length > 300) throw new BadRequestException('Enter a subject of up to 300 characters.');
    if (!body || body.length > 10_000) throw new BadRequestException('Enter a message of up to 10,000 characters.');

    const attachments: Array<{ filename: string; content: string }> = [];
    if (input.attachPdf !== false) {
      const { file, buffer } = await this.quotations.elencoCostiPdf(input.quotationId, user.id); // also checks ownership
      attachments.push({ filename: file, content: buffer.toString('base64') });
    } else {
      await this.quotations.get(input.quotationId, user.id);
    }

    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#17303a">${body
      .split(/\r?\n/)
      .map((l) => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
      .join('<br>')}</div>`;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM ?? 'Somec Quotations <onboarding@resend.dev>', to, subject, text: body, html, ...(user.email && !/\.local$/i.test(user.email) ? { reply_to: user.email } : {}), attachments }),
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!response.ok || !payload.id) {
      const msg = payload.message ?? `Resend returned ${response.status}`;
      this.log.warn(`Email not sent: ${msg}`);
      throw new BadRequestException(/own email address|verify a domain/i.test(msg) ? `${msg} (Resend test mode: verify a sending domain at resend.com/domains and set RESEND_FROM to send to anyone.)` : msg);
    }
    this.log.log(`Email ${payload.id} sent to ${to.length} recipient(s) for quotation ${input.quotationId}`);
    return { id: payload.id, to };
  }
}
