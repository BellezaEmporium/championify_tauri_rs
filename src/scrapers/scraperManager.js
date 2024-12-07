import scrapers from '../scrapers';

export default class ScraperManager {
  static async scrapeData(scraperId, type) {
    const scraper = scrapers[scraperId];
    if (!scraper) throw new Error(`Scraper not found: ${scraperId}`);

    const data = await scraper.getData(type);
    store.set(`${scraperId}_${type}_itemsets`, data);
    return data;
  }
}
