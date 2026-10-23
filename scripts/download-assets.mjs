import { mkdir, writeFile, access } from 'node:fs/promises';

const photos = {
  jakarta: 'photo-1555899434-94d1368aa7af', city: 'photo-1480714378408-67cf0d13bc1b',
  train: 'photo-1474487548417-781cb71495f3', community: 'photo-1511632765486-a01980e01a18',
  forest: 'photo-1441974231531-c6227db76b6e', school: 'photo-1503676260728-1c00da094a0b',
  world: 'photo-1451187580459-43490279c0fa', paris: 'photo-1502602898657-3e91760cbb34',
  japan: 'photo-1493976040374-85c8e12f0c0e', conference: 'photo-1511578314322-379afb476865',
  market: 'photo-1611974789855-9c2a0a7236a3', business: 'photo-1497366754035-f200968a6e72',
  coffee: 'photo-1447933601403-0c6688de566e', solar: 'photo-1509391366360-2e959784a276',
  tech: 'photo-1485827404703-89b55fcc595e', laptop: 'photo-1496181133206-80ce9b88a853',
  phone: 'photo-1511707171634-5f897ff02aa9', code: 'photo-1555066931-4365d14bab8c',
  football: 'photo-1574629810360-7efbbe195018', stadium: 'photo-1522778119026-d647f0596c20',
  running: 'photo-1552674605-db6ffd4facb5', basketball: 'photo-1546519638-68e109498ffc',
  bali: 'photo-1537996194471-e657df975ab4', food: 'photo-1504674900247-0877df9cc836',
  interior: 'photo-1600210492486-724fe5c67fb0', mountain: 'photo-1464822759023-fed622ff2c3b',
  car: 'photo-1503376780353-7e6692767b70', electric: 'photo-1593941707882-a5bba14938c7',
  road: 'photo-1440404653325-ab127d49abc1', bike: 'photo-1558981806-ec527fa84c39',
  concert: 'photo-1459749411175-04bf5292ceea', film: 'photo-1489599849927-2ee91cede3ba',
  music: 'photo-1516280440614-37939bbacd81', art: 'photo-1577083552431-6e5fd01aa342',
  books: 'photo-1507842217343-583bb7270b66', reading: 'photo-1455390582262-044cdead277a',
  ocean: 'photo-1518837695005-2083093ee35b', rice: 'photo-1501785888041-af3ef285b470',
  author1: 'photo-1472099645785-5658abf4ff4e', author2: 'photo-1580489944761-15a19d654956',
  author3: 'photo-1500648767791-00dcc994a43e', author4: 'photo-1534528741775-53994a69daeb',
};
await mkdir('assets/images', { recursive: true });
await mkdir('assets/fonts', { recursive: true });
const queue = Object.entries(photos);
let completed = 0;
async function worker() {
  while (queue.length) {
    const [name, id] = queue.shift();
    const path = `assets/images/${name}.webp`;
    try { await access(path); completed++; continue; } catch {}
    const width = name.startsWith('author') ? 160 : name === 'jakarta' ? 1400 : 1000;
    try {
      const response = await fetch(`https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80&fm=webp`, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await writeFile(path, Buffer.from(await response.arrayBuffer()));
      completed++;
    } catch (error) { console.error(`${name}: ${error.message}`); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`Local photos ready: ${completed}/${Object.keys(photos).length}`);
try {
  const css = await (await fetch('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap', { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const matches = [...css.matchAll(/font-weight: (\d+);[\s\S]*?url\(([^)]+)\)/g)];
  for (const match of matches) {
    const result = await fetch(match[2]);
    await writeFile(`assets/fonts/jakarta-${match[1]}.ttf`, Buffer.from(await result.arrayBuffer()));
  }
  console.log(`Local font weights ready: ${matches.length}`);
} catch (error) { console.error(`Font: ${error.message}`); }
