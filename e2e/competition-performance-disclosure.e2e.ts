import { expect, test, type Page } from '@playwright/test';

const ROOM_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_NAME = 'Contract Room';

const room = {
  id: ROOM_ID,
  name: ROOM_NAME,
  organizerType: 'USER',
  createdAt: '2026-08-01T00:00:00Z',
  recruitmentOpensAt: '2026-08-01T00:00:00Z',
  participationClosesAt: '2026-08-10T00:00:00Z',
  botParticipationLimit: 25,
  perAccountBotLimit: 2,
};

const pageOf = (item: Record<string, unknown>) => ({
  snapshotId: 'snapshot-1',
  snapshotStatus: 'FINAL',
  cutoffAt: room.participationClosesAt,
  items: [item],
  nextCursor: null,
  hasMore: false,
});

async function serveCompetitionContract(page: Page): Promise<void> {
  await page.route('**/api/v1/competition/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/rooms/public')) {
      await route.fulfill({ json: { items: [room], nextCursor: null, hasMore: false } });
      return;
    }
    if (path.endsWith('/rooms/mine')) {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (path.endsWith(`/rooms/${ROOM_ID}/leaderboard/my-bots`)) {
      await route.fulfill({ json: pageOf({
        rank: 3,
        jointRank: false,
        anonymousAlias: 'Bot Mine',
        score: 82,
        eligibilityStatus: 'ELIGIBLE',
        equityAmount: 10500,
        totalReturnPct: 5,
        maxDrawdownPct: -3,
        sharpeRatio: 1.2,
        evidence: null,
      }) });
      return;
    }
    if (path.endsWith(`/rooms/${ROOM_ID}/leaderboard`)) {
      await route.fulfill({ json: pageOf({
        rank: 1,
        jointRank: false,
        anonymousAlias: 'Bot 3F9A',
        score: 91.2,
        eligibilityStatus: 'ELIGIBLE',
        equityAmount: 11000,
        totalReturnPct: 10,
        maxDrawdownPct: -2,
        sharpeRatio: 1.8,
        viewerEvidence: null,
      }) });
      return;
    }
    await route.fulfill({ status: 404, json: { title: 'Not Found' } });
  });
}

for (const scenario of [
  {
    name: 'Korean desktop',
    viewport: { width: 1440, height: 900 },
    language: 'ko',
    openLabel: '열기',
    disclosure: '모의 성과 · 실제 투자 결과를 보장하지 않습니다.',
  },
  {
    name: 'English mobile',
    viewport: { width: 390, height: 844 },
    language: 'en',
    openLabel: 'Open',
    disclosure: 'Simulated performance · Actual investment results are not guaranteed.',
  },
] as const) {
  test(`${scenario.name} keeps simulated-performance disclosure with both leaderboards`, async ({ page }) => {
    await page.setViewportSize(scenario.viewport);
    await page.addInitScript((language) => window.localStorage.setItem('i2s-language', language), scenario.language);
    await serveCompetitionContract(page);

    await page.goto('/competition');
    await page.getByRole('listitem', { name: `${ROOM_NAME} ${scenario.openLabel}` }).click();

    const detail = page.getByRole('region', { name: scenario.language === 'ko' ? `${ROOM_NAME} 상세` : `${ROOM_NAME} details` });
    await expect(detail.getByText(scenario.disclosure)).toHaveCount(2);
    await expect(detail.getByText(scenario.disclosure).first()).toBeVisible();
    await expect(detail.getByText(scenario.disclosure).last()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
}
