// Copies the hotel photos into public/photos/<public id>.jpg so pages have real
// images before Cloudinary is configured (the loader falls back to these).
// Runs before every build; public/photos is git-ignored.
import fs from 'node:fs';
import path from 'node:path';

const manifest = fs.readFileSync('src/server/content/images.ts', 'utf8');
const entries = [...manifest.matchAll(/id: '([^']+)',\s*file: `\$\{SRC\}\/([^`]+)`/g)];
const src = 'design/uploads/Hotel-A-Wise-Images-web';
let n = 0;
for (const [, id, file] of entries) {
  const to = path.join('public/photos', 'hotel-a-wise', `${id}.jpg`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(src, file), to);
  n++;
}
console.log(`copied ${n} photos to public/photos`);
