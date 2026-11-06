import "server-only";

import nodemailer from "nodemailer";

type ReminderMessage = {
  notificationId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

export class EmailDeliveryUnknownError extends Error {}

function hasResend() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

function hasSmtp() {
  return Boolean(process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASSWORD);
}

/** Kênh gửi email nhắc lịch trực tiếp: Resend (ưu tiên) hoặc SMTP tên miền (vd. Hostinger). null = dùng Apps Script như cũ. */
export function reminderEmailProvider(): "resend" | "smtp" | null {
  if (hasResend()) return "resend";
  if (hasSmtp()) return "smtp";
  return null;
}

export function requireReminderEmailConfigured() {
  if (!reminderEmailProvider()) {
    throw new Error("Chưa cấu hình RESEND_API_KEY/RESEND_FROM_EMAIL hoặc SMTP_HOST/SMTP_USER/SMTP_PASSWORD");
  }
}

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

async function sendViaSmtp(message: ReminderMessage): Promise<string> {
  const port = Number(process.env.SMTP_PORT || 465);
  smtpTransport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
  });
  try {
    const info = await smtpTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      messageId: `<tdw-reminder-${message.notificationId}@${String(process.env.SMTP_HOST).trim()}>`,
    });
    if (info.rejected?.length) throw new Error("Máy chủ SMTP từ chối người nhận");
    return info.messageId;
  } catch (error) {
    // Lỗi khi đã gửi xong dữ liệu có thể là email vẫn đi: không đánh dấu để gửi lại.
    const code = (error as { code?: string }).code;
    if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNRESET") {
      throw new EmailDeliveryUnknownError("Không xác nhận được máy chủ SMTP đã nhận email");
    }
    throw new Error(error instanceof Error && error.message.startsWith("Máy chủ SMTP") ? error.message : "Máy chủ SMTP từ chối email");
  }
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

export function reminderStatus(type: string) {
  if (type.startsWith("OVERDUE_")) return "Đã quá hạn";
  const days = type.slice(4);
  return days === "0" ? "Đến hạn hôm nay" : `Còn ${days} ngày đến hạn`;
}

export function formatReminderDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function reminderHtml(title: string, recipientName: string, fields: Array<[string, string]>, footer: string) {
  const rows = fields.map(([label, value]) => `<tr><td style="padding:5px 14px 5px 0;color:#64748b">${escapeEmailHtml(label)}</td><td><strong>${escapeEmailHtml(value)}</strong></td></tr>`).join("");
  return `<div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.55"><h2 style="color:#08769a">${escapeEmailHtml(title)}</h2><p>Chào ${escapeEmailHtml(recipientName)},</p><table style="border-collapse:collapse">${rows}</table><p>${escapeEmailHtml(footer)}</p></div>`;
}

export async function sendReminderEmail(message: ReminderMessage): Promise<string> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(message.to)) throw new Error("Địa chỉ email người nhận không hợp lệ");
  if (!/^[0-9a-f-]{36}$/i.test(message.notificationId)) throw new Error("Mã thông báo email không hợp lệ");
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    if (hasSmtp()) return sendViaSmtp(message);
    throw new Error("Chưa cấu hình RESEND_API_KEY hoặc RESEND_FROM_EMAIL");
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `tdw-reminder-${message.notificationId}`,
      },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
  } catch {
    // A timed-out request may have been accepted. Do not mark it retryable.
    throw new EmailDeliveryUnknownError("Không xác nhận được Resend đã nhận email");
  }
  const result = await response.json().catch(() => ({})) as { id?: string };
  // Provider error bodies may contain recipient or message data; only persist the status code.
  if (!response.ok) throw new Error(`Resend từ chối email (HTTP ${response.status})`);
  if (!result.id) throw new EmailDeliveryUnknownError("Resend không trả mã email");
  return result.id;
}

export async function sendReminderBatch<T extends { notification_id: string }>(
  items: T[],
  makeMessage: (item: T) => ReminderMessage,
) {
  const results: Array<{ notification_id: string; status: "SENT" | "FAILED" | "UNKNOWN"; error: string }> = new Array(items.length);
  let cursor = 0;
  let nextStart = Date.now();
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      // Pace starts below Resend's default 10 requests/second while keeping
      // a few in flight when the network is slow.
      const startAt = nextStart;
      nextStart += 150;
      if (startAt > Date.now()) await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));
      try {
        await sendReminderEmail(makeMessage(item));
        results[index] = { notification_id: item.notification_id, status: "SENT", error: "" };
      } catch (error) {
        results[index] = {
          notification_id: item.notification_id,
          status: error instanceof EmailDeliveryUnknownError ? "UNKNOWN" : "FAILED",
          error: error instanceof Error ? error.message.slice(0, 500) : "Không thể gửi email",
        };
      }
    }
  }));
  return results;
}
