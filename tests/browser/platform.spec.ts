import { test, expect } from "@playwright/test";

test("real district, building selection, nearby parking and source details", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "생활시설 30", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "건물 1,484", exact: true }).click();
  await page
    .getByRole("textbox", { name: "시설 또는 건물 검색" })
    .fill("사보이");
  await page
    .getByRole("button", {
      name: "사보이시티잠실오피스텔 상업 90m",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("complementary", { name: "건물 상세" }),
  ).toContainText("실측 정확도는 검증되지 않았습니다");
  await expect(
    page.getByRole("complementary", { name: "건물 상세" }),
  ).toContainText("90m");
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await page.getByRole("button", { name: "검색어 지우기" }).click();
  await page.getByRole("button", { name: "생활시설 30", exact: true }).click();
  await page.getByRole("button", { name: "주차장", exact: true }).click();
  await expect(
    page.getByText("이 범위의 주차장은 잔여면 정보가 없습니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "주변 연동 주차장 보기" }).click();
  await expect(page.getByRole("checkbox", { name: "주변 포함" })).toBeChecked();
  // A clean CI database has no provider observations. Do not assume live keys/data exist.
  const parking = await (
    await page.request.get("/api/places?scope=nearby&kind=PARKING")
  ).json();
  const linkedCount = parking.filter(
    (place: { liveSupported: boolean }) => place.liveSupported,
  ).length;
  await expect(page.locator(".gis-place")).toHaveCount(linkedCount);
  if (linkedCount > 0) {
    await expect(page.locator(".gis-place-main").first()).toContainText("주변");
  } else {
    await expect(page.getByText("조건에 맞는 장소가 없어요")).toBeVisible();
  }
  await page.getByRole("button", { name: "출처와 정확도" }).click();
  await expect(page.getByRole("dialog")).toContainText("828");
  await expect(page.getByRole("dialog")).toContainText("2024년");
  await expect(
    page.getByRole("link", { name: "건물별 점검 목록 CSV" }),
  ).toBeVisible();
});

test("mobile map remains visible through list and building detail navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "방이2동 3D GIS 지도" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "건물 1,484", exact: true }).click();
  await page
    .getByRole("button", { name: "목록 펼치기", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: "사보이시티잠실오피스텔 상업 90m",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("complementary", { name: "건물 상세" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "방이2동 3D GIS 지도" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "상세 닫기" }).click();
  await expect(
    page.getByRole("textbox", { name: "시설 또는 건물 검색" }),
  ).toBeVisible();
});
