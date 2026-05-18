import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';
const FILE = path.join(DATA_DIR, 'membership.json');

const DEFAULT = {
  googleRefreshToken: null,
  googleTokenIssuedAt: null,
  links: {}, // discordUserId → { youtubeChannelId, linkedAt }
};

let cache = null;
let writeQueue = Promise.resolve();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function load() {
  if (cache) return cache;
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    cache = { ...DEFAULT, ...JSON.parse(raw) };
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    cache = structuredClone(DEFAULT);
  }
  return cache;
}

async function persist() {
  await ensureDir();
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(cache, null, 2));
  await fs.rename(tmp, FILE);
}

export const store = {
  async read() {
    return await load();
  },
  // Serialize writes to avoid lost-update races.
  async update(mutator) {
    writeQueue = writeQueue.then(async () => {
      await load();
      await mutator(cache);
      await persist();
    });
    return writeQueue;
  },
};
