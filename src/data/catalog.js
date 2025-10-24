const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/consoleLogger');
const { STORE_URL } = require('../config');

const DEFAULT_CATEGORY_PATH = 'catalog';

function extractFromSrcset(value = '') {
  return value
    .split(',')
    .map((chunk) => chunk.trim().split(' ')[0])
    .find((chunk) => chunk && !chunk.startsWith('data:')) || null;
}

function normalizeStoreUrl(value) {
  if (!value) {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/^url\((['"]?)(.*?)\1\)$/i, '$2');

  if (!cleaned || cleaned.startsWith('data:')) {
    return null;
  }

  try {
    return new URL(cleaned, STORE_URL).toString();
  } catch (error) {
    logger.debug('Не удалось нормализовать ссылку %s: %s', cleaned, error.message);
    return null;
  }
}

function findProductImage(element, $) {
  const images = $(element).find('img').toArray();

  for (const img of images) {
    const $img = $(img);
    const attributes = [
      'data-src',
      'data-original',
      'data-lazy',
      'data-large_image',
      'data-large-image',
      'data-image',
      'src',
      'data-srcset',
      'srcset'
    ];

    for (const attribute of attributes) {
      const value = $img.attr(attribute);
      if (!value) {
        continue;
      }

      const normalized = normalizeStoreUrl(
        attribute.includes('srcset') ? extractFromSrcset(value) : value
      );

      if (normalized) {
        return normalized;
      }
    }

    const style = $img.attr('style');
    if (style) {
      const match = style.match(/url\((['"]?)(.*?)\1\)/i);
      if (match) {
        const normalized = normalizeStoreUrl(match[2]);
        if (normalized) {
          return normalized;
        }
      }
    }
  }

  const linkedImage = $(element)
    .find('a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".webp"], a[href*=".gif"]')
    .first()
    .attr('href');

  return normalizeStoreUrl(linkedImage);
}

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
  const image = findProductImage(element, $);

  return {
    title: title || 'Без названия',
    price,
    availability,
    link,
    image
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
