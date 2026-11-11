// scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('assets', { recursive: true });

const icons = [
  { input: 'scripts/logo/icon.svg',     output: 'assets/icon.png' },
  { input: 'scripts/logo/adaptive.svg', output: 'assets/adaptive-icon.png' },
  { input: 'scripts/logo/splash.svg',   output: 'assets/splash-icon.png' },
  { input: 'scripts/logo/mono.svg',     output: 'assets/adaptive-icon-monochrome.png' },
];

for (const { input, output } of icons) {
  await sharp(input, { density: 384 }).resize(1024, 1024).png().toFile(output);
  console.log(`✓ ${output}`);
}