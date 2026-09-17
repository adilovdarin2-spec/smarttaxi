// Rasterize our vector masters. Run after build_brand.py; requires sharp.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const root = path.resolve(__dirname, '../..');
const brand = path.join(root, 'apps/web/public/brand');
const mobile = path.join(root, 'apps/mobile/smarttaxi_app');
const res = path.join(mobile, 'android/app/src/main/res');

async function render(source, target, width, height = width) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await sharp(Buffer.from(source)).resize(width, height).png().toFile(target);
}

async function main() {
  const icon = await fs.readFile(path.join(brand, 'baisapar_icon.svg'), 'utf8');
  const round = await fs.readFile(path.join(brand, 'baisapar_icon_round.svg'), 'utf8');
  // Maskable artwork must fill the canvas; the mark is already inside the
  // central safe circle. The OS, not an embedded rounded tile, supplies corners.
  const maskable = icon.replace('rx="232"', 'rx="0"');
  await fs.writeFile(path.join(brand, 'baisapar_icon_maskable.svg'), maskable);
  for (const [density, size] of Object.entries({mdpi:48, hdpi:72, xhdpi:96, xxhdpi:144, xxxhdpi:192})) {
    await render(icon, path.join(res, `mipmap-${density}/ic_launcher.png`), size);
    await render(round, path.join(res, `mipmap-${density}/ic_launcher_round.png`), size);
  }
  for (const size of [192, 512, 1024]) {
    await render(icon, path.join(brand, `baisapar_icon_${size}.png`), size);
  }
  await render(maskable, path.join(brand, 'baisapar_icon_maskable_512.png'), 512);
  await render(maskable, path.join(brand, 'baisapar_apple_touch_icon.png'), 180);
  await render(icon, path.join(res, 'drawable/baisapar_splash_icon.png'), 384);
  await render(icon, path.join(res, 'drawable-nodpi/smarttaxi_app_icon.png'), 512);
  await render(icon, path.join(res, 'drawable-nodpi/smarttaxi_splash_icon.png'), 384);
  await render(icon, path.join(mobile, 'assets/brand/baisapar_app_icon.png'), 512);
  for (const name of ['baisapar_wordmark', 'baisapar_wordmark_light', 'baisapar_lockup', 'baisapar_lockup_light', 'baisapar_play_feature']) {
    const svg = await fs.readFile(path.join(brand, `${name}.svg`), 'utf8');
    const metadata = await sharp(Buffer.from(svg)).metadata();
    const height = name.includes('play_feature') ? 500 : 200;
    const width = Math.round(height * metadata.width / metadata.height);
    await render(svg, path.join(brand, `${name}.png`), width, height);
    if (name.startsWith('baisapar_wordmark')) {
      await render(svg, path.join(mobile, `assets/brand/${name}.png`), width, height);
    }
  }
  await render(icon, path.join(mobile, 'web/favicon.png'), 32);
  for (const size of [192, 512]) {
    await render(icon, path.join(mobile, `web/icons/Icon-${size}.png`), size);
    await render(maskable, path.join(mobile, `web/icons/Icon-maskable-${size}.png`), size);
  }
  // Review sheet uses the exact shipped artwork, not a generated mock-up.
  const lockup = await fs.readFile(path.join(brand, 'baisapar_lockup.svg'), 'utf8');
  const embed = (svg, x, y, width, height) => `<image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"/>`;
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="760" viewBox="0 0 1400 760">
    <rect width="1400" height="760" fill="#F5F8FF"/>
    <rect x="40" y="40" width="1320" height="680" rx="32" fill="white"/>
    ${embed(icon, 110, 130, 440, 440)}
    ${embed(lockup, 650, 220, 610, 160)}
    ${embed(round, 655, 454, 96, 96)}
    ${embed(icon, 793, 478, 64, 64)}
    ${embed(icon, 901, 502, 40, 40)}
    ${embed(icon, 985, 518, 24, 24)}
    <rect x="655" y="609" width="155" height="8" rx="4" fill="#1D6FFF"/>
    <rect x="826" y="609" width="155" height="8" rx="4" fill="#0B4FD1"/>
    <rect x="997" y="609" width="155" height="8" rx="4" fill="#EAF3FF"/>
  </svg>`;
  await render(preview, path.join(root, 'design-reference/baisapar-brand-2026-09-17.png'), 1400, 760);
  console.log('BaiSapar: Android, Flutter, web/PWA, logo kit and review sheet exported.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
