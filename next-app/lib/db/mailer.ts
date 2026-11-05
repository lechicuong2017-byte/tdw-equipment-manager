import "server-only";
// Gửi email mời / đặt lại mật khẩu qua SMTP (vd. email tên miền trên Hostinger: smtp.hostinger.com:465).
// Nếu chưa cấu hình SMTP, liên kết được trả về để quản trị viên tự gửi cho người dùng.

import nodemailer from "nodemailer";

function appUrl() {
  return String(process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export function hasSmtp() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export function authLink(type: "invite" | "recovery", token: string, redirectTo?: string) {
  let next = "/set-password";
  if (redirectTo) {
    try {
      const u = new URL(redirectTo, appUrl() || "http://localhost");
      if (u.pathname.startsWith("/") && !u.pathname.startsWith("//")) next = u.pathname === "/auth/set-password" ? "/set-password" : u.pathname;
    } catch {
      // giữ mặc định
    }
  }
  const params = new URLSearchParams({ token_hash: token, type, next });
  return `${appUrl()}/auth/confirm?${params.toString()}`;
}

export async function sendAuthEmail(type: "invite" | "recovery", to: string, token: string, redirectTo?: string) {
  const link = authLink(type, token, redirectTo);
  if (!hasSmtp()) {
    console.warn(`[mail] SMTP chưa cấu hình — liên kết ${type} cho ${to} được trả về cho quản trị viên.`);
    return link;
  }
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  const subject = type === "invite" ? "Lời mời sử dụng hệ thống quản lý TDW" : "Đặt lại mật khẩu hệ thống quản lý TDW";
  const intro =
    type === "invite"
      ? "Bạn được mời sử dụng hệ thống quản lý thiết bị, xe và chi phí của TDW. Bấm nút bên dưới để đặt mật khẩu (liên kết có hiệu lực 72 giờ)."
      : "Có yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Bấm nút bên dưới để đặt mật khẩu mới (liên kết có hiệu lực 2 giờ). Nếu không phải bạn yêu cầu, hãy bỏ qua email này.";
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `${intro}\n\n${link}\n`,
    html: `<p>${intro}</p><p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#0f5bd8;color:#fff;border-radius:6px;text-decoration:none">${type === "invite" ? "Đặt mật khẩu" : "Đặt lại mật khẩu"}</a></p><p style="color:#666;font-size:12px">${link}</p>`,
  });
  return link;
}
