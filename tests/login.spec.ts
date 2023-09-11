import { expect, test } from "@playwright/test";

test("login test", async ({ page }) => {
  await page.goto("http://localhost:5173/login");

  // Fill in the username and password fields
  await page.fill('input[name="email"]', "test@capgo.app");
  await page.fill('input[name="password"]', "testtest");

  // Click the submit button
  await page.getByRole("button", { name: "Log in" }).click();

  // Expect the URL to change to the logged in dashboard
  await expect(page).toHaveURL("http://localhost:5173/app/home");
});
