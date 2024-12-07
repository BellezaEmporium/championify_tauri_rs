import BaseScraper from './baseScraper.js';
import { request, cl, spliceVersion, trinksCon } from '../../helpers';
import store from '../store';
import Log from '../../logger';

const UGG_BUILD_MODES = ['recommended', 'on-hit', 'crit', 'lethality', 'ad', 'ap', 'tank'];

export default class UggScraper extends BaseScraper {
  constructor() {
    super('U.gg', 'ugg');
    this.versionUrl = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/ugg-api-versions.json';
  }

  async getVersion() {
    try {
      const body = await request({ url: this.versionUrl, json: true });
      if (!body || !body.versions) throw new Error('Missing version data');
      return body.versions[0].builds;
    } catch (error) {
      Log.warn(error);
      return '1.5.0'; // Fallback version
    }
  }

  async getData(type) {
    const champs = await this._getAvailableChamps(type);
    return await this._processChamps(champs, type);
  }

  async _getAvailableChamps(type) {
    try {
      const url = `https://stats2.u.gg/lol/1.5/overview/world/${await this.getVersion()}/ranked_solo_5x5/emerald_plus//${UGG_VERSION}.json`;
      const response = await request({ url, json: true });
      if (!response.champions) throw new Error(`Missing champions for type: ${type}`);
      return response.champions.map(champ => champ.name).sort();
    } catch (error) {
      Log.warn(error);
      return [];
    }
  }

  async _processChamps(champs, type) {
    return Promise.all(
      champs.map(async champ => {
        cl(`Processing U.gg ${type}: ${champ}`);
        try {
          const params = { url: `https://stats2.u.gg/lol/1.5/${UGG_BUILD_MODES.Recommended}/${getRiotPatch()}/${mode}/${champ}/${UGG_VERSION}.json`, json: true };
          const riotJson = await request(params);
          if (!riotJson.blocks) throw new Error(`Missing blocks for ${champ}`);
          riotJson.title = `${type} Build ${spliceVersion(store.get('riot_ver'))}`;
          riotJson.blocks = trinksCon(riotJson.blocks);
          return { champ, data: riotJson };
        } catch (error) {
          Log.warn(error);
          store.push('undefined_builds', { source: this.name, champ, position: type });
          return null;
        }
      })
    ).then(results => results.filter(Boolean)); // Remove nulls
  }
}