// graphQL / Mobalytics API
import cheerio from 'cheerio';
import moment from 'moment';

import ChampionifyErrors from '../errors';
import Log from '../logger';
import { arrayToBuilds, cl, request, trinksCon } from '../helpers';
import progressbar from '../progressbar';
import store from '../store';
import T from '../translate';

import default_schema from "../../data/default.json" with { type: "json" };

export const source_info = {
  name: 'Mobalytics',
  id: 'mobalytics'
};

const API_URL = 'https://mobalytics.gg/api/lol/graphql/v1/query'

function getChamps() {
  return request({ url: 'https://probuilds.net/champions', json: true })
    .then(body => {
      const $ = cheerio.load(body);
      return $('.champion-name').map((_, el) => $(el).attr('href').split('/').pop()).get();
    });
}

/**
 * Mobalytics proposes a list of available builds per role, per champion, though it needs a specific request in order to get them.
 * It cannot be given a champion ID, it needs the champion name (per "slug").
 * "filtersOptions.roles" contains all builds available for that champion, for the latest available patch.
 * It can be used afterwards to get the builds of a champion.
 * @param {string} champ 
 */
function getAvailableRolesForChamp(champ) {
    return request({
      url: API_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        operationName: 'LolChampionCommonFiltersQuery',
        variables: {
          slug: champ,
          role: null,
          queue: null,
          rank: 'All',
          region: null
        },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: 'c8842090c0c1b721ca94dfe9e01f5d123147f5f8de9f108d366682526676395b'
          }
        }
      })
    }).then(response => response.json())
    .then(response => {
      return JSON.stringify(response.data.champion.cid, response.data.champion.filtersOptions.roles);
    });
}

function getIDs($, el) {
  return arrayToBuilds(el.find('.item').map((idx, entry) => $(entry).attr('data-id')).get());
}

function getItems(champ_case) {
    const champ = champ_case.toLowerCase();
    cl(`${T.t('processing')} Mobalytics: ${T.t(champ)}`);

    return getAvailableRolesForChamp(champ)
        .then(roles => {
            return Promise.all(roles.map(role => {
                return request({
                    url: API_URL,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        operationName: 'LolChampionBuildOptionsQuery',
                        variables: {
                            slug: champ,
                            role: role,
                            queue: null,
                            rank: 'All',
                            region: null
                        },
                        extensions: {
                            persistedQuery: {
                                version: 1,
                                sha256Hash: '5368aefc52bea8b2989529f5df7ee3511f65b69c2c4e9cbb7541cd5bad6c718e'
                            }
                        }
                    })
                }).then(response => response.json());
            }));
        })
        .then(responses => {
            return responses.flatMap(response => {
                return response.data.lol.champion.seoBuilds.options.map(build => {
                    const buildType = build.type || 'Unknown';
                    const items = getIDs(cheerio.load(build.items), cheerio.load(build.items));
                    const riot_json = {
                        ...default_schema,
                        champion: champ,
                        title: `Mobalytics ${moment().format('YYYY-MM-DD')}`,
                        blocks: [
                            {
                                items: items,
                                type: T.t(buildType.toLowerCase(), true)
                            }
                        ]
                    };

                    riot_json.blocks = trinksCon(riot_json.blocks);
                    progressbar.incrChamp();
                    return { champ, file_prefix: buildType.toLowerCase(), riot_json, source: 'mobalytics' };
                });
            });
        })
        .catch(err => {
            Log.error(err);
            store.push('undefined_builds', {
                source: source_info.name,
                champ,
                position: 'All'
            });
        });
}

export function getSr() {
  return getChamps()
    .then(champs => Promise.all(champs.map(champ => getItems(champ))))
    .then(data => data.filter(item => item !== null))
    .then(data => store.push('sr_itemsets', data));
}

export function getVersion() {
  return Promise.resolve(moment().format('YYYY-MM-DD'));
}