import cheerio from 'cheerio';

import { arrayToBuilds, cl, request, shorthandSkills, trinksCon } from '../helpers';
import Log from '../logger';
import progressbar from '../progressbar';
import store from '../store';
import T from '../translate';

import csspaths from "../../resources/base_data/csspaths.json" with { type: "json" };
import default_schema from "../../resources/base_data/default.json" with { type: "json" };
import prebuilts from "../../resources/base_data/prebuilts.json" with { type: "json" };

const templates = {
  combindedStart: (pickrate, winrate) => `${T.t('frequent', true)}/${T.t('highest_start', true)} - Winrate: ${winrate}, Pickrate: ${pickrate}%`,
  combinedCore: (pickrate, winrate) => `${T.t('frequent', true)}/${T.t('highest_core', true)} - Winrate: ${winrate}%, Pickrate: ${pickrate}%`,
  combinedItems: (pickrate, winrate) => `${T.t('frequent', true)}/${T.t('highest_items', true)} - Winrate: ${winrate}%, Pickrate: ${pickrate}%`,
  pickStart: (pickrate) => `${T.t('mf_starters', true)} - Pickrate: ${pickrate}%`,
  pickCore: (pickrate) => `${T.t('mf_core', true)} - Pickrate: ${pickrate}%`,
  pickItems: (pickrate) => `${T.t('mf_items', true)} - Pickrate: ${pickrate}%`,
  winStart: (winrate) => `${T.t('hw_starters', true)} - Winrate: ${winrate}%`,
  winCore: (winrate) => `${T.t('hw_core', true)} - Winrate: ${winrate}%`,
  winItems: (winrate) => `${T.t('hw_items', true)} - Winrate: ${winrate}%`
};

/**
 * Export
 */
export const source_info = {
  name: 'op.gg',
  id: 'opgg'
};

function pickWinrate(items) {
  return items.sort((a, b) => a.winrate - b.winrate).pop();
}

function pickPickrate(items) {
  return items.sort((a, b) => a.pickrate - b.pickrate).pop();
}

function createBlock(templateFunc, rate_type, items, appended_items = []) {
  const entry = items.sort((a, b) => a[rate_type] - b[rate_type]).pop();
  const combinedItems = entry.items.concat(appended_items);
  return {
    items: arrayToBuilds(combinedItems),
    type: templateFunc(entry[rate_type]),
    rate: entry[rate_type]
  };
}

function createSituationalItemsBlock(templateFunc, rate_type, items) {
  const sorted = items.sort((a, b) => b[rate_type] - a[rate_type]);
  const rate = `${sorted[0][rate_type]}-${sorted[5][rate_type]}`;
  return {
    items: arrayToBuilds(sorted.slice(0, 6).map(item => item.items)),
    type: templateFunc(rate),
    rate
  };
}

function mergeBlocks(templateFunc, pickrate, winrate) {
  if (JSON.stringify(pickrate) === JSON.stringify(winrate)) {
    return {
      items: pickrate.items,
      type: templateFunc(pickrate.rate, winrate.rate)
    };
  }
  return [pickrate, winrate];
}

function formatForStore(champ, position, skills, set_type, file_prefix, blocks) {
  let title = T.t(position, true);
  if (set_type) title += ` ${set_type}`;
  const riot_json = {
    ...default_schema,
    champion: champ,
    title: `OPGG ${title} ${store.get('opgg_ver')}`,
    blocks: trinksCon(blocks.map(block => {
      const { rate, ...rest } = block;
      return rest;
    }), skills)
  };

  if (store.get('settings').locksr) riot_json.map = 'SR';
  return { champ, file_prefix, riot_json, source: 'opgg' };
}

function mapItems($, selector) {
  return $(selector)
    .map((idx, el) => {
      el = $(el);
      const items = el.find('img')
        .map((idx, item_el) => $(item_el).attr('src').split('/').pop().split('.')[0])
        .filter(entry => entry !== 'blet')
        .get();

      const pickrate = Number(el
        .find('.champion-stats__table__cell--pickrate')
        .eq(0)
        .contents()
        .filter(function() {
          return this.type === 'text';
        })
        .text()
        .split('%')[0]
        .replace(/[^0-9.]/g, '')
        .trim()
      );

      const winrate = Number(el
        .find('.champion-stats__table__cell--winrate')
        .eq(0)
        .text()
        .replace(/[^0-9.]/g, '')
      );

      return { items, pickrate, winrate };
    })
    .get();
}

function mapSkills($, selector) {
  const skills = $(selector)
    .map((idx, el) => {
      el = $(el);
      const pickrate = el.find('.champion-stats__table__cell--pickrate').text().split('%')[0].replace(/[^0-9.]/g, '').trim() + '%';
      const winrate = el.find('.champion-stats__table__cell--winrate').text().split('%')[0].replace(/[^0-9.]/g, '').trim() + '%';
      const skills = el.find('tr').eq(1).text().replace(/[^A-Z]/g, '').split('');
      return { skills, pickrate, winrate };
    })
    .get();

  const pickrate = pickPickrate(skills);
  const winrate = pickWinrate(skills);

  if (store.get('settings').skillsformat) {
    return {
      most_freq: shorthandSkills(pickrate.skills),
      highest_win: shorthandSkills(winrate.skills)
    };
  }
  return {
    most_freq: pickrate.skills.join('.'),
    highest_win: pickrate.skills.join('.')
  };
}

function _makeRequest(url) {
  return request({
    url,
    headers: {
      'Accept-Language': 'en-US,en;q=0.8,fr;q=0.6,es;q=0.4',
      Cookie: 'customLocale=en_US',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.98 Safari/537.36',
      'X-Requested-With': 'XMLHttpRequest'
    }
  })
  .then(cheerio.load);
}

export function getVersion() {
  return request('https://www.op.gg/champion/ahri/statistics/mid')
    .then(cheerio.load)
    .then($ => $('.champion-stats-header-version').text().split(':').pop().trim())
    .then(version => {
      store.set('opgg_ver', version);
      return version;
    });
}

export function getSr() {
  if (!store.get('opgg_ver')) return getVersion().then(getSr);

  return _makeRequest('https://www.op.gg/champion/statistics')
    .then($ => {
      return $('.champion-index__champion-list')
        .find('.champion-index__champion-item')
        .map((idx, el) => {
          el = $(el);
          return {
            name: el.attr('data-champion-key'),
            positions: el.find('span').map((idx, pos_el) => {
              const position = $(pos_el).text().toLowerCase();
              if (position === 'middle') return 'mid';
              return position;
            }).get()
          };
        })
        .get();
    })
    .then(champ_data => {
      return Promise.all(champ_data.map(async champ => {
        cl(`${T.t('processing')} op.gg: ${T.t(champ.name)}`);
        const results = await Promise.allSettled(champ.positions.map(async position => {
          try {
            const [$i, $s] = await Promise.all([
              _makeRequest(`https://www.op.gg/champion/${champ.name}/statistics/${position}/item`),
              _makeRequest(`https://www.op.gg/champion/${champ.name}/statistics/${position}/skill`)
            ]);

            const skills = mapSkills($s, csspaths.opgg.skills);
            const starter = mapItems($i, csspaths.opgg.starter);
            const core = mapItems($i, csspaths.opgg.core);
            const items = mapItems($i, csspaths.opgg.items);
            let boots = mapItems($i, csspaths.opgg.boots);
            // Snakes don't wear boots
            if (!boots.length) boots = [{ items: [], winrate: 0, pickrate: 0 }];

            const winrate = [
              createBlock(templates.winStart, 'winrate', starter, prebuilts.trinkets.map(t => t.id)),
              createBlock(templates.winCore, 'winrate', core, pickWinrate(boots).items),
              createSituationalItemsBlock(templates.winItems, 'winrate', items)
            ];
            const pickrate = [
              createBlock(templates.pickStart, 'pickrate', starter, prebuilts.trinkets.map(t => t.id)),
              createBlock(templates.pickCore, 'pickrate', core, pickPickrate(boots).items),
              createSituationalItemsBlock(templates.pickItems, 'pickrate', items)
            ];

            if (store.get('settings').splititems) {
              return [
                formatForStore(champ.name, position, skills, T.t('most_freq', true), `${position}_mostfreq`, pickrate),
                formatForStore(champ.name, position, skills, T.t('highest_win', true), `${position}_highwin`, winrate)
              ];
            }

            const merged_blocks = [
              mergeBlocks(templates.combindedStart, pickrate[0], winrate[0]),
              mergeBlocks(templates.combindedStart, pickrate[1], winrate[1]),
              mergeBlocks(templates.combindedStart, pickrate[2], winrate[2])
            ].flat();

            return formatForStore(champ.name, position, skills, null, position, merged_blocks);
          } catch (err) {
            Log.error(err);
            store.push('undefined_builds', {
              source: source_info.name,
              champ: champ.name,
              position: champ.positions
            });
            return null;
          }
        }));

        return results.filter(result => result.status === 'fulfilled').map(result => result.value).flat();
      }));
    })
    .then(data => data.flat())
    .then(data => data.filter(item => item !== null))
    .then(data => store.push('sr_itemsets', data));
}
