const { Telegraf } = require('telegraf');
const cron = require('node-cron');
const { TELEGRAM_TOKEN, CACHE_TTL_MINUTES } = require('../config');
const logger = require('../utils/consoleLogger');
const { fetchCatalog, fetchCategories } = require('../data/catalog');
const { getCatalog, updateCatalog } = require('../storage/catalogCache');

if (!TELEGRAM_TOKEN) {
  throw new Error('TELEGRAM_TOKEN не задан.');
}

const bot = new Telegraf(TELEGRAM_TOKEN);
const sessions = new Map();

function escapeMarkdown(text = '') {
  return text.replace(/([*_`\[\]()~>#+=|{}.!\\-])/g, '\\$1');
}

async function loadCatalog({ force = false, category } = {}) {
  if (!force && !category) {
    const cached = getCatalog();
    if (cached && cached.length) {
      return cached;
    }
  }

  const products = await fetchCatalog({ category });

  if (!category) {
    updateCatalog(products);
  }

  return products;
}

function formatPrice(price) {
  if (typeof price !== 'number' || Number.isNaN(price)) {
    return 'Цена уточняется';
  }
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(price);
}

function formatProductCard(product, index, total, context) {
  const lines = [];

  if (context) {
    lines.push(escapeMarkdown(context));
  }

  lines.push(escapeMarkdown(`Товар ${index + 1} из ${total}`));
  lines.push(`*${escapeMarkdown(product.title)}*`);
  lines.push(escapeMarkdown(formatPrice(product.price)));
  lines.push(escapeMarkdown(product.availability || 'Уточняйте наличие'));

  if (product.link) {
    lines.push(`[Перейти на сайт](${escapeMarkdown(product.link)})`);
  }

  return lines.join('\n');
}

function getNavigationKeyboard() {
  return {
    inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'prev' }, { text: '▶️ Далее', callback_data: 'next' }]]
  };
}

function setSession(chatId, data) {
  sessions.set(chatId, {
    ...sessions.get(chatId),
    ...data
  });
}

function getSession(chatId) {
  return sessions.get(chatId);
}

async function sendProduct(ctx, products, index = 0) {
  if (!products || !products.length) {
    await ctx.reply('Каталог пуст. Попробуйте позже или уточните запрос.');
    return;
  }

  const normalizedIndex = (index + products.length) % products.length;
  setSession(ctx.chat.id, {
    products,
    index: normalizedIndex
  });

  const product = products[normalizedIndex];
  const session = getSession(ctx.chat.id);
  const message = formatProductCard(product, normalizedIndex, products.length, session?.context);
  const keyboard = { reply_markup: getNavigationKeyboard() };

  if (product.image) {
    try {
      await ctx.replyWithPhoto(
        { url: product.image },
        {
          caption: message,
          parse_mode: 'MarkdownV2',
          ...keyboard
        }
      );
      return;
    } catch (error) {
      logger.warn('Не удалось отправить изображение товара %s: %s', product.link || product.title, error.message);
    }
  }

  await ctx.replyWithMarkdownV2(message, keyboard);
}

async function handleStart(ctx) {
  const welcome = [
    'Здравствуйте! Я бот магазина MyCulto.',
    'Доступные команды:',
    '• /start — показать эту подсказку',
    '• /categories — посмотреть категории каталога',
    '• /category <номер> — открыть категорию из списка',
    '• /search <запрос> — поиск по товарам',
    '• /refresh — обновить кэш каталога',
    '',
    `Каталог автоматически обновляется каждые ${CACHE_TTL_MINUTES} минут.`
  ].join('\n');

  await ctx.reply(welcome);

  try {
    const products = await loadCatalog();
    await sendProduct(ctx, products, 0);
  } catch (error) {
    logger.error('Не удалось показать стартовый товар: %s', error.message);
    await ctx.reply('Не удалось загрузить каталог. Попробуйте команду /refresh позже.');
  }
}

async function handleCategories(ctx) {
  try {
    const categories = await fetchCategories();

    if (!categories.length) {
      await ctx.reply('Не удалось получить список категорий. Попробуйте позже.');
      return;
    }

    setSession(ctx.chat.id, { categories });

    const lines = categories
      .slice(0, 20)
      .map((category, index) => `${index + 1}. ${category.name}`)
      .join('\n');

    const help = categories.length > 20 ? '\n(Показаны первые 20 категорий)' : '';

    await ctx.reply(`Категории:\n${lines}${help}\n\nИспользуйте /category <номер>, чтобы открыть категорию.`);
  } catch (error) {
    logger.error('Ошибка получения категорий: %s', error.message);
    await ctx.reply('Произошла ошибка при получении категорий.');
  }
}

async function handleCategory(ctx) {
  const session = getSession(ctx.chat.id);
  if (!session || !session.categories) {
    await ctx.reply('Сначала запросите список категорий командой /categories.');
    return;
  }

  const index = Number(ctx.message.text.split(' ')[1]) - 1;
  if (Number.isNaN(index) || index < 0 || index >= session.categories.length) {
    await ctx.reply('Укажите корректный номер категории.');
    return;
  }

  const category = session.categories[index];
  await ctx.reply(`Загружаю категорию «${category.name}»...`);

  try {
    const products = await loadCatalog({ category: category.link });
    setSession(ctx.chat.id, { context: `Категория: ${category.name}` });
    await sendProduct(ctx, products, 0);
  } catch (error) {
    logger.error('Ошибка загрузки категории: %s', error.message);
    await ctx.reply('Не удалось загрузить выбранную категорию.');
  }
}

async function handleSearch(ctx) {
  const query = ctx.message.text.split(' ').slice(1).join(' ').trim();

  if (!query) {
    await ctx.reply('Укажите поисковый запрос: /search <название товара>');
    return;
  }

  try {
    const products = await loadCatalog();
    const results = products.filter((product) =>
      product.title.toLowerCase().includes(query.toLowerCase())
    );

    if (!results.length) {
      await ctx.reply('Ничего не найдено. Попробуйте уточнить запрос.');
      return;
    }

    setSession(ctx.chat.id, { context: `Поиск: ${query}` });
    await sendProduct(ctx, results, 0);
  } catch (error) {
    logger.error('Ошибка поиска: %s', error.message);
    await ctx.reply('Не удалось выполнить поиск. Попробуйте позже.');
  }
}

async function handleRefresh(ctx) {
  await ctx.reply('Обновляю кэш каталога...');
  try {
    const products = await loadCatalog({ force: true });
    await ctx.reply(`Кэш обновлён. Доступно товаров: ${products.length}.`);
  } catch (error) {
    logger.error('Ошибка обновления кэша: %s', error.message);
    await ctx.reply('Не удалось обновить кэш.');
  }
}

bot.start(handleStart);
bot.command('start', handleStart);
bot.command('categories', handleCategories);
bot.command('category', handleCategory);
bot.command('search', handleSearch);
bot.command('refresh', handleRefresh);

bot.action('next', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const session = getSession(ctx.chat.id);
    if (!session || !session.products) {
      await ctx.reply('Сначала выберите список товаров.');
      return;
    }
    await sendProduct(ctx, session.products, session.index + 1);
  } catch (error) {
    logger.error('Ошибка обработки кнопки next: %s', error.message);
  }
});

bot.action('prev', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const session = getSession(ctx.chat.id);
    if (!session || !session.products) {
      await ctx.reply('Сначала выберите список товаров.');
      return;
    }
    await sendProduct(ctx, session.products, session.index - 1);
  } catch (error) {
    logger.error('Ошибка обработки кнопки prev: %s', error.message);
  }
});

async function refreshCatalogJob() {
  try {
    logger.info('Плановое обновление каталога...');
    await loadCatalog({ force: true });
    logger.info('Плановое обновление каталога завершено.');
  } catch (error) {
    logger.error('Ошибка планового обновления каталога: %s', error.message);
  }
}

cron.schedule(`*/${CACHE_TTL_MINUTES} * * * *`, refreshCatalogJob, {
  timezone: 'Europe/Moscow'
});

module.exports = {
  bot,
  loadCatalog,
  refreshCatalogJob
};
