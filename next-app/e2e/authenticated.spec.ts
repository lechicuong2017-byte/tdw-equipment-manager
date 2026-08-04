import { expect, test } from "@playwright/test";

test("vai trò đã đăng nhập truy cập được giao diện và dữ liệu theo RLS", async ({
  page,
}) => {
  await page.goto("/assets");

  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Thiết bị" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Điều hướng chính" })).toBeVisible();
});

test("chỉ admin truy cập được màn hình quản trị người dùng", async ({
  page,
}, testInfo) => {
  await page.goto("/admin/users");

  if (testInfo.project.name === "admin") {
    await expect(
      page.getByRole("heading", { name: "Người dùng và phạm vi dữ liệu" }),
    ).toBeVisible();
    return;
  }

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Chào / }),
  ).toBeVisible();
});
