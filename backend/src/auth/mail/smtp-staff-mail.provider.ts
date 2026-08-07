import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { StaffMailProvider, StaffPasswordResetMail } from './staff-mail-provider.interface';

@Injectable()
export class SmtpStaffMailProvider implements StaffMailProvider {
  async sendPasswordReset(message: StaffPasswordResetMail) {
    const host = process.env.SMTP_HOST?.trim();
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const from = process.env.MAIL_FROM?.trim();
    const port = Number(process.env.SMTP_PORT || 587);

    if (!host || !user || !password || !from || !Number.isInteger(port) || port <= 0) {
      throw new Error('Staff password-reset email delivery is not configured.');
    }

    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });

    await transport.sendMail({
      from,
      to: message.to,
      subject: 'Đặt lại mật khẩu nhân sự Moka Solar',
      text: [
        'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản nhân sự Moka Solar.',
        '',
        `Mở liên kết sau trong vòng ${message.expiresInMinutes} phút:`,
        message.resetUrl,
        '',
        'Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và liên hệ quản trị viên.',
      ].join('\n'),
      html: [
        '<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản nhân sự Moka Solar.</p>',
        `<p>Liên kết có hiệu lực trong <strong>${message.expiresInMinutes} phút</strong>.</p>`,
        `<p><a href="${this.escapeHtml(message.resetUrl)}">Đặt lại mật khẩu</a></p>`,
        '<p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và liên hệ quản trị viên.</p>',
      ].join(''),
    });
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
