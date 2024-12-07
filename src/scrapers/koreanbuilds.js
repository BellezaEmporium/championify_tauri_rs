import { Conf } from 'electron-conf/renderer';
import i18next from 'i18next';
import { arrayToBuilds, cl, trinksCon } from '../../utils';
import { progressbar } from '../../utils/progress';
import cheerio from 'cheerio';

import default_schema from "../../../resources/base_data/default.json" with { type: "json" };
import prebuilts from "../../../resources/base_data/prebuilts.json" with { type: "json" };

export const source_info = {
  name: 'KoreanBuilds',
  id: 'koreanbuilds'
};

const store = new Conf();
const T = i18next.t.bind(i18next);
const BASE_URL = 'https://api.koreanbuilds.net';
const API_KEY = 'Basic kb-frontend T3M1ewuHj2QwsWB';
const headers = { Authorization: API_KEY };

async function processChampionData(champData) {
  try {
    cl(`${T('processing')} Koreanbuilds: ${T(champData.formatted_name.toLowerCase().replace(/[^a-z]/g, ''))}`);
    progressbar.incrChamp();

    const rolePromises = champData.roles.map(async (role) => {
      const data = await fetch(`${BASE_URL}/builds?chmpname=${champData.formatted_name}&patchid=-2&position=COMPOSITE`, { headers })
        .then(r => r.json());

      if (!data || !data.builds2 || data.builds2.length === 0) return null;

      const buildsData = data.builds2.slice(0, 5);

      const settings = store.get('settings') || {};

      const buildPromises = buildsData.map(async (buildData, index) => {
        const skills = buildData.skillOrder.split('').map(s => {
          switch(s) {
            case '1': return 'Q';
            case '2': return 'W'; 
            case '3': return 'E';
            case '4': return 'R';
            default: return '';
          }
        });

        const formattedSkills = settings.skillsformat ? 
          shorthandSkills(skills) : 
          skills.join('.');

        const early_items = [
          buildData.startItem0,
          buildData.startItem1,
          buildData.startItem2,
          buildData.startItem3,
          buildData.startItem4,
          buildData.startItem5
        ].filter(i => i && i.itemId).map(i => i.itemId);

        const core_items = [
          buildData.item0,
          buildData.item1,
          buildData.item2,
          buildData.item3,
          buildData.item4,
          buildData.item5
        ].filter(i => i && i.itemId).map(i => i.itemId);

        const blocks = trinksCon([
          {
            items: arrayToBuilds(early_items),
            type: `${T('starter')} - ${buildData.wins}/${buildData.games} - ${buildData.games} ${T('games_played')}`
          },
          {
            items: arrayToBuilds(core_items),
            type: T('core_items')
          }
        ], { highest_win: formattedSkills, most_freq: formattedSkills });

        return {
          champ: champData.formatted_name,
          file_prefix: `${role.toLowerCase()}_${index + 1}`,
          riot_json: {
            ...structuredClone(default_schema),
            champion: champData.formatted_name,
            title: `KRB ${role} Build ${index + 1} ${store.get('korbuilds_ver')}`,
            blocks
          },
          source: 'koreanbuilds'
        };
      });

      return await Promise.all(buildPromises);
    });

    const resultsPerRole = await Promise.all(rolePromises);
    const results = resultsPerRole.flat().filter(Boolean);

    return results;
  } catch (err) {
    console.warn(err);
    const undefinedBuilds = store.get('undefined_builds') || [];
    undefinedBuilds.push({
      champ: champData.formatted_name,
      position: champData.roles,
      source: source_info.name
    });
    store.set('undefined_builds', undefinedBuilds);
    return [];
  }
}

export async function getChampionData() {
  const data = await fetch(`${BASE_URL}/champions?patchid=-1`, { headers })
    .then(r => r.json());

  const champions = data.champions.map(champ => ({
    id: champ.id,
    name: champ.name,
    formatted_name: champ.localName,
    roles: Object.entries(champ.builds)
      .filter(([_, games]) => games > 0)
      .map(([role]) => role)
  }));

  const results = await Promise.all(champions.map(processChampionData));
  const existingItemsets = store.get('sr_itemsets') || [];
  store.set('sr_itemsets', [...existingItemsets, ...results.flat()]);
}

export async function getVersion() {
  const data = await fetch(`${BASE_URL}/champions?patchid=-1`, { headers })
    .then(r => r.json());

  store.set('korbuilds_ver', data.patches[0].patchVersion);
}