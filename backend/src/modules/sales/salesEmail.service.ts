import nodemailer from 'nodemailer';
import type { CompanySettings, Prisma } from '@prisma/client';
import { z } from 'zod';

type InvoiceForEmail = Prisma.SalesInvoiceGetPayload<{
  include: {
    customer: true;
    items: { include: { item: true; unit: true; priceList: true } };
  };
}>;

export type EmailNotificationResult = {
  status: 'sent' | 'skipped' | 'not_configured' | 'failed';
  message: string;
  email?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]!);
}

function formatAmount(value: unknown, currency: string) {
  const amount = Number(value);
  return `${currency} ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function getTransport() {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  if (!host || !from) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be a valid TCP port.');
  }

  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  if (Boolean(user) !== Boolean(pass)) {
    throw new Error('SMTP_USER and SMTP_PASS must both be configured.');
  }

  return {
    from,
    transport: nodemailer.createTransport({
      host,
      port,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
      secure: process.env.SMTP_SECURE
        ? process.env.SMTP_SECURE.toLowerCase() === 'true'
        : port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    }),
  };
}

export async function sendSalesInvoiceEmail(
  invoice: InvoiceForEmail,
  company: CompanySettings | null,
): Promise<EmailNotificationResult> {
  const email = invoice.customer.email?.trim();
  if (!email) {
    return { status: 'skipped', message: 'Customer has no email address.' };
  }
  if (!z.string().email().safeParse(email).success) {
    return { status: 'skipped', message: 'Customer email address is invalid.', email };
  }

  const mailer = getTransport();
  if (!mailer) {
    return {
      status: 'not_configured',
      message: 'Configure SMTP_HOST and SMTP_FROM on the backend to send invoice emails.',
      email,
    };
  }

  const currency = company?.currencyCode || 'NPR';
  const companyName = company?.companyName || 'Pyloom POS';
  const lines = invoice.items.map((line) => {
    const itemName = line.item.name;
    const unitName = line.unit?.abbreviation || line.unit?.name || '';
    const priceListName = line.priceList?.name?.trim();
    const displayPriceListName =
      priceListName?.toLowerCase() === 'wholesale' ||
      (priceListName?.toLowerCase() === 'default price list' && !/(carton|box)/i.test(
        `${line.unit?.name ?? ''} ${line.unit?.abbreviation ?? ''}`,
      ))
        ? ''
        : priceListName
          ? ` (${priceListName})`
          : '';
    const quantity = Number(line.quantity);
    const lineTotal = formatAmount(line.lineTotal, currency);
    return {
      html: `<tr><td>${escapeHtml(itemName + displayPriceListName)}</td><td style="text-align:right">${quantity} ${escapeHtml(unitName)}</td><td style="text-align:right">${lineTotal}</td></tr>`,
      text: `${itemName}${displayPriceListName} — ${quantity} ${unitName} — ${lineTotal}`,
    };
  });
  const invoiceDate = invoice.invoiceDate.toISOString().slice(0, 10);
  const footer = company?.invoiceFooter?.trim() || 'Thank you for your business.';
  const total = formatAmount(invoice.grandTotal, currency);
  const paid = formatAmount(invoice.paidAmount, currency);
  const outstanding = formatAmount(invoice.outstandingAmount, currency);
  const address = [company?.addressLine1, company?.city].filter(Boolean).join(', ');

  await mailer.transport.sendMail({
    from: mailer.from,
    to: email,
    subject: `Sales invoice ${invoice.invoiceNumber} from ${companyName}`,
    text: [
      companyName,
      address,
      `Invoice: ${invoice.invoiceNumber}`,
      `Date: ${invoiceDate}`,
      `Customer: ${invoice.customer.name}`,
      ...lines.map((line) => line.text),
      `Total: ${total}`,
      `Paid: ${paid}`,
      `Outstanding: ${outstanding}`,
      footer,
    ].filter(Boolean).join('\n'),
    html: `<!doctype html><html><body style="margin:0;background:#f4f8fc;font-family:Arial,sans-serif;color:#172b4d"><div style="max-width:640px;margin:24px auto;padding:24px;background:#fff;border:1px solid #dce7f3;border-radius:12px"><h1 style="margin:0 0 4px;color:#1769aa">${escapeHtml(companyName)}</h1>${address ? `<p style="margin:0 0 20px;color:#526579">${escapeHtml(address)}</p>` : ''}<h2 style="margin:20px 0 8px">Sales invoice</h2><p style="margin:0 0 16px;color:#526579">${escapeHtml(invoice.invoiceNumber)} · ${invoiceDate}</p><p>Hello ${escapeHtml(invoice.customer.name)},</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;border-bottom:1px solid #dce7f3;padding:8px 4px">Item</th><th style="text-align:right;border-bottom:1px solid #dce7f3;padding:8px 4px">Quantity</th><th style="text-align:right;border-bottom:1px solid #dce7f3;padding:8px 4px">Amount</th></tr></thead><tbody>${lines.map((line) => line.html).join('')}</tbody></table><table style="margin:16px 0 0 auto"><tbody><tr><td style="padding:4px 12px">Total</td><td style="text-align:right;font-weight:bold">${total}</td></tr><tr><td style="padding:4px 12px">Paid</td><td style="text-align:right">${paid}</td></tr><tr><td style="padding:4px 12px">Outstanding</td><td style="text-align:right">${outstanding}</td></tr></tbody></table><p style="margin:24px 0 0;color:#526579">${escapeHtml(footer)}</p></div></body></html>`,
  });

  return { status: 'sent', message: `Invoice email sent to ${email}.`, email };
}

export type { InvoiceForEmail };
