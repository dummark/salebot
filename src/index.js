const logger = require('./utils/consoleLogger');
const { bot, loadCatalog, refreshCatalogJob } = require('./bot');

async function bootstrap() {
  try {
    await loadCatalog({ force: true });
    logger.info('Первичная загрузка каталога завершена.');
  } catch (error) {
    logger.error('Не удалось выполнить первичную загрузку каталога: %s', error.message);
  }

  try {
    await bot.launch();
    logger.info('Бот запущен и готов к работе.');
  } catch (error) {
    logger.error('Не удалось запустить бота: %s', error.message);
    process.exit(1);
  }
}

process.once('SIGINT', () => {
  logger.info('Получен сигнал SIGINT. Останавливаю бота...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  logger.info('Получен сигнал SIGTERM. Останавливаю бота...');
  bot.stop('SIGTERM');
});

bootstrap();

module.exports = {
  bot,
  loadCatalog,
  refreshCatalogJob
};
