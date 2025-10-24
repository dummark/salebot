const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { STORE_URL } = require('../config');

const DEFAULT_CATEGORY_PATH = 'catalog';

function parseProduct(element, $) {
  const title = $(element).find('.product-name a, .product-title, .product__title').first().text().trim();
  const priceText = $(element)
    .find('.price, .product-price, .product__price, [itemprop="price"]')
    .first()
    .text()
    .replace(/[^0-9.,]/g, '')
    .replace(',', '.');
  const price = priceText ? Number(priceText) : null;
  const availability = $(element)
    .find('.status, .product-stock, .product__availability, .product-availability')
    .first()
    .text()
    .trim() || 'Уточняйте наличие';
  const linkPath = $(element).find('a').first().attr('href') || '';
  const link = linkPath.startsWith('http') ? linkPath : new URL(linkPath, STORE_URL).toString();
  const image = $(element).find('img').first().attr('src');

  return {
    title: title || 'Без названия',
    price,
    availability,
    link,
    image: image ? (image.startsWith('http') ? image : new URL(image, STORE_URL).toString()) : null
  };
}

async function fetchCatalog({ category = DEFAULT_CATEGORY_PATH } = {}) {
  const url = new URL(category, STORE_URL).toString();
  logger.info('Запрос каталога: %s', url);

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const productElements = $('.product, .product-item, .product-thumb, [data-entity="item"]');

    if (!productElements.length) {
      logger.warn('Не найдено товаров по селекторам на странице %s', url);
    }

    const products = productElements
      .map((_, el) => parseProduct(el, $))
      .get()
      .filter((product) => product.title);

    logger.info('Получено товаров: %d', products.length);
    return products;
  } catch (error) {
    logger.error('Ошибка получения каталога: %s', error.message);
    throw error;
  }
}

async function fetchCategories() {
  const url = new URL('/', STORE_URL).toString();
  logger.info('Запрос категорий: %s', url);
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0 Safari/537.36'
      },
      timeout: 15000
    });
    const $ = cheerio.load(response.data);

    const links = new Map();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (!href || !text) {
        return;
      }
      if (/catalog|product|collection/i.test(href) && text.length > 2) {
        const normalized = href.startsWith('http') ? href : new URL(href, STORE_URL).toString();
        links.set(text, normalized);
      }
    });

    const categories = Array.from(links.entries()).map(([name, link]) => ({ name, link }));
    logger.info('Получено категорий: %d', categories.length);
    return categories;
  } catch (error) {
    logger.error('Ошибка получения категорий: %s', error.message);
    return [];
  }
}

module.exports = {
  fetchCatalog,
  parseProduct,
  fetchCategories
};
