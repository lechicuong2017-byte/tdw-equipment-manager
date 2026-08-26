import { expect, test } from "@playwright/test";

test("route được bảo vệ chuyển người chưa đăng nhập về trang đăng nhập", async ({
  page,
}) => {
  const response = await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Chào mừng trở lại" }),
  ).toBeVisible();

  const contentSecurityPolicy =
    response?.headers()["content-security-policy"] || "";
  expect(contentSecurityPolicy).toContain("object-src 'none'");
  expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
});

test("mã recovery trong URL được chuyển tới màn hình tạo mật khẩu", async ({
  page,
}) => {
  const expiresAt = Math.floor(Date.now() / 1000) + 300;

  await page.goto(
    `/login#access_token=test-access-token&type=recovery&expires_at=${expiresAt}`,
  );

  await expect(page).toHaveURL(/\/auth\/set-password$/);
  await expect(
    page.getByRole("heading", { name: "Tạo mật khẩu" }),
  ).toBeVisible();
});

test("endpoint cron từ chối request không có secret", async ({ request }) => {
  const response = await request.get("/api/jobs/maintenance-reminders");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
});
