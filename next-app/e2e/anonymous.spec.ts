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

test("endpoint cron từ chối request không có secret", async ({ request }) => {
  const response = await request.get("/api/jobs/maintenance-reminders");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
});
