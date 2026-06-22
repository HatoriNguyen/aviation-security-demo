const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = 'C:/Users/khoan/.gemini/antigravity/brain/08158fd7-4ae6-4e2e-84be-f775101898b7/screenshots';
const BASE_URL = 'http://localhost:3000';

const sl = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 }
  });

  const page = await browser.newPage();

  // === 1: Trang dang nhap ===
  console.log('[1/7] Chup trang dang nhap...');
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sl(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_page.png') });
  console.log('  -> 01_login_page.png OK');

  // === 2: Dang nhap Admin ===
  console.log('[2/7] Dang nhap Admin...');
  await page.click('#quickAdmin');
  await sl(1000);
  await page.click('#loginBtn');
  await sl(3000);

  // Chuyen tab AI Chat
  const chatNav = await page.$('[data-tab="ai-chat"]');
  if (chatNav) {
    await chatNav.click();
    await sl(1500);
  }

  // Chon mon hoc dau tien
  const opts = await page.$$eval('#chatCourseSelect option', os => os.map(o => o.value).filter(v => v));
  if (opts.length > 0) {
    await page.select('#chatCourseSelect', opts[0]);
    await sl(1000);
  }

  // === 3: Giao dien AI Chat ===
  console.log('[3/7] Chup giao dien AI Chat...');
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_ai_chat_interface.png') });
  console.log('  -> 02_ai_chat_interface.png OK');

  // === 4: Cau hoi hop le ===
  console.log('[4/7] Gui cau hoi hop le...');
  await page.type('#chatInput', 'Dao ham cua ham so luong giac tinh nhu the nao?');
  await sl(500);
  await page.click('#chatSendBtn');
  await sl(6000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_valid_question.png') });
  console.log('  -> 03_valid_question.png OK');

  // === 5: Test Prompt Injection ===
  console.log('[5/7] Test Prompt Injection...');
  const atkIgnore = await page.$('#attackIgnore');
  if (atkIgnore) {
    await atkIgnore.click();
    await sl(4000);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_prompt_injection.png') });
  console.log('  -> 04_prompt_injection.png OK');

  // === 6: Test SQL Injection ===
  console.log('[6/7] Test SQL Injection...');
  const atkSQL = await page.$('#attackSQL');
  if (atkSQL) {
    await atkSQL.click();
    await sl(4000);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_sql_injection.png') });
  console.log('  -> 05_sql_injection.png OK');

  // === 7: Test XSS ===
  console.log('[7/7] Test XSS attack...');
  await page.evaluate(() => { document.getElementById('chatInput').value = ''; });
  const xssPayload = String.fromCharCode(60) + 'script' + String.fromCharCode(62) + 'alert(1)' + String.fromCharCode(60) + '/script' + String.fromCharCode(62);
  await page.type('#chatInput', xssPayload + ' giai bai tap toan');
  await sl(500);
  await page.click('#chatSendBtn');
  await sl(4000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_xss_attack.png') });
  console.log('  -> 06_xss_attack.png OK');

  // === BONUS: Audit Log ===
  console.log('[Bonus] Chup Audit Log...');
  const auditNav = await page.$('[data-tab="audit"]');
  if (auditNav) {
    await auditNav.click();
    await sl(2000);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_audit_log.png') });
  console.log('  -> 07_audit_log.png OK');

  await browser.close();
  console.log('\n=== HOAN THANH: Screenshots saved to ' + SCREENSHOT_DIR + ' ===');
})();
