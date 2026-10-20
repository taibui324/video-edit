import { test, expect } from '@playwright/test';
import { fixture, fixtureTokens } from '../fixture.ts';

test('applied feedback belongs to one proposal and returned revision; Undo and new plans clear confirmation', async ({ page }, info) => {
  const files = await fixture(info.outputPath('fixtures'));
  await page.route('**/api/ai', route => route.fulfill({ json: { available: true, model: 'synthetic-browser-contract' } }));
  const proposals = new Map<string, { projectId: string; revision: number; plan: unknown }>();
  await page.route('**/api/projects/*/proposals', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({ json: [] }); return; }
    const projectId = route.request().url().split('/').at(-2)!, revision = route.request().postDataJSON().revision, id = 'contract-' + proposals.size;
    const plan = { summary: 'Remove the controlled green marker.', operations: [{ kind: 'remove_words', first: 'word-1', last: 'word-1', reason: 'Synthetic provider fixture.' }] };
    proposals.set(id, { projectId, revision, plan });
    await route.fulfill({ json: { id, projectId, revision, plan, scope: null, status: 'succeeded', instruction: 'Controlled request.', model: 'synthetic-browser-contract', createdAt: new Date().toISOString() } });
  });
  await page.route('**/api/proposals/*/apply', async route => {
    const id = route.request().url().split('/').at(-2)!, p = proposals.get(id)!;
    const response = await page.request.post(`/api/projects/${p.projectId}/commands`, { data: { revision: p.revision, op: 'plan', value: { plan: p.plan, scope: null } } });
    await route.fulfill({ status: response.status(), json: await response.json() });
  });
  await page.goto('/'); await page.getByLabel('Import media', { exact: true }).setInputFiles(files.media);
  await expect(page.getByRole('heading', { name: 'Script', exact: true })).toBeVisible();
  await page.getByLabel('Import timed transcript', { exact: true }).setInputFiles({ name: 'known.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixtureTokens)) });
  await expect(page.getByRole('button', { name: 'Green', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Request edit plan', exact: true }).click();
  await page.getByRole('button', { name: 'Apply proposed edits', exact: true }).click();
  const confirmation = page.getByText('Applied. Use Undo to restore the previous composition.', { exact: true });
  await expect(confirmation).toBeVisible(); await expect(page.getByText(/The composition changed/)).toHaveCount(0);
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(confirmation).toHaveCount(0); await expect(page.getByText(/The composition changed/)).toBeVisible();
  await page.getByRole('button', { name: 'Request edit plan', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply proposed edits', exact: true })).toBeEnabled();
  await expect(confirmation).toHaveCount(0); await page.getByRole('button', { name: 'Apply proposed edits', exact: true }).click(); await expect(confirmation).toBeVisible();
  await page.screenshot({ path: info.outputPath('applied-proposal-feedback.png'), fullPage: true });
});
