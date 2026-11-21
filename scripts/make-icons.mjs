// Gera os ícones PNG do PWA a partir de icon.svg (iOS exige PNG para apple-touch-icon).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('icon.svg');
const out = [
  ['public/icon-192.png', 192, 0],
  ['public/icon-512.png', 512, 0],
  ['public/apple-touch-icon.png', 180, 0],
  ['public/icon-maskable-512.png', 512, 0.18],
];
for (const [file, size, pad] of out) {
  const inner = Math.round(size * (1 - pad * 2));
  const icon = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#f3eddf' } })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(file);
  console.log('ok', file);
}
