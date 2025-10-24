const fs = require('fs');
const path = require('path');
const logger = require('../utils/consoleLogger');
const { CACHE_FILE, CACHE_TTL_MINUTES } = require('../config');

const cachePath = path.resolve(CACHE_FILE);

function ensureDirectory() {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readCache() {
  try {
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn('Не удалось прочитать кэш каталога: %s', error.message);
    }
    return null;
  }
}

function writeCache(data) {
  try {
    ensureDirectory();
    fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    logger.warn('Не удалось записать кэш каталога: %s', error.message);
  }
}

function isExpired(updatedAt) {
  if (!updatedAt) {
    return true;
  }
  const updated = new Date(updatedAt);
  const diffMinutes = (Date.now() - updated.getTime()) / 60000;
  return diffMinutes >= CACHE_TTL_MINUTES;
}

function getCatalog() {
  const cache = readCache();
  if (!cache) {
    return null;
  }
  if (isExpired(cache.updatedAt)) {
    logger.info('Кэш просрочен, требуется обновление.');
    return null;
  }
  return cache.data;
}

function updateCatalog(products) {
  writeCache({
    updatedAt: new Date().toISOString(),
    data: products
  });
}

module.exports = {
  getCatalog,
  updateCatalog,
  isExpired,
  readCache
};
