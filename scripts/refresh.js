const logger = require('../src/utils/logger');
const { loadCatalog } = require('../src/bot');

(async () => {
  try {
    const products = await loadCatalog({ force: true });
    logger.info('Кэш успешно обновлён. Получено товаров: %d', products.length);
    process.exit(0);
  } catch (error) {
    logger.error('Не удалось обновить кэш: %s', error.message);
    process.exit(1);
  }
})();
