import { chromium } from '@playwright/test';

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleLogs = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => pageErrors.push({ message: err.message, stack: err.stack }));
  page.on('requestfailed', req => failedRequests.push({ url: req.url(), failure: req.failure() }));

  const response = await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle', timeout: 15000 });
  console.log('Status:', response?.status());

  const url = page.url();
  const title = await page.title();
  const text = await page.evaluate(() => document.body.innerText);
  const html = await page.evaluate(() => document.getElementById('root')?.innerHTML || '');

  console.log('Current URL:', url);
  console.log('Title:', title);
  console.log('Console logs:', JSON.stringify(consoleLogs, null, 2));
  console.log('Page errors:', JSON.stringify(pageErrors, null, 2));
  console.log('Failed requests:', JSON.stringify(failedRequests, null, 2));
  console.log('Body text:\n', text);
  console.log('HTML snippet:\n', html.slice(0, 500));

  await page.screenshot({ path: 'evidence/screenshots/debug-current.png' });
  await browser.close();
}

diagnose().catch(err => {
  console.error('Diagnosis error:', err);
  process.exit(1);
});
