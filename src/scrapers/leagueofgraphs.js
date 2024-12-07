import cheerio from 'cheerio';
import { cl, request, shorthandSkills, trinksCon } from '../helpers';
import championify from '../championify';
import Log from '../logger';
import progressbar from '../progressbar';
import store from '../store';
import T from '../translate';
import default_schema from '../../data/default.json' assert { type: 'json' };

export const source_info = {
  name: 'LeagueOfGraphs',
  id: 'leagueofgraphs',
};

function _arrayToBuilds(ids) {
  const processedIds = ids.map(id => (id === 2010 ? '2003' : id.toString()));
  const counts = processedIds.reduce((acc, id) => {
    acc[id] = (acc[id] || 0) + 1;
    return acc;
  }, {});
  return Array.from(new Set(processedIds)).map(id => ({
    id,
    count: counts[id],
  }));
}

async function _getItems(champ, position) {
  const riot_items = store.get('item_names');
  const response = await request.get(
    `http://www.leagueofgraphs.com/champions/items/${champ.toLowerCase()}/${position}/`
  );
  const $c = cheerio.load(response);

  const starter_items_td = $c('.itemStarters').find('td').first();
  const starter_item_imgs = starter_items_td.find('img');
  const last_item_count = parseInt(starter_items_td.text().replace(/\D/g, ''), 10);
  const starter_items = starter_item_imgs
    .map((_, elem) => {
      const altText = $c(elem).attr('alt');
      const id = altText === 'Total Biscuit of Rejuvenation' ? '2010' : riot_items[altText];
      return _ === starter_item_imgs.length - 1 && last_item_count
        ? Array(last_item_count).fill(id)
        : id;
    })
    .get()
    .flat();

  const core_items = $c('.data_table')
    .eq(1)
    .find('td')
    .first()
    .find('img')
    .map((_, elem) => riot_items[$c(elem).attr('alt')])
    .get();

  const end_items = $c('.data_table')
    .eq(2)
    .find('img')
    .slice(0, 6)
    .map((_, elem) => riot_items[$c(elem).attr('alt')])
    .get();

  const boots = $c('.data_table')
    .eq(3)
    .find('img')
    .slice(0, 3)
    .map((_, elem) => riot_items[$c(elem).attr('alt')])
    .get();

  return {
    starter_items,
    core_items,
    end_items,
    boots,
  };
}

async function _getSkills(champ, position) {
  const response = await request.get(
    `http://www.leagueofgraphs.com/champions/skills-orders/${champ.toLowerCase()}/${position}/`
  );
  const $c = cheerio.load(response);

  const skills = [];
  const skill_keys = ['Q', 'W', 'E', 'R'];

  $c('.skillsOrderTable')
    .first()
    .find('tr')
    .each((idx, elem) => {
      if (idx === 0) return;
      const ability = skill_keys[idx - 1];
      $c(elem)
        .find('.skillCell')
        .each((i, cell) => {
          if ($c(cell).hasClass('active')) skills[i] = ability;
        });
    });

  return store.get('settings').skillsformat ? shorthandSkills(skills) : skills.join('.');
}

async function _getPositions(champ) {
  const response = await request.get(`http://www.leagueofgraphs.com/champions/items/${champ.toLowerCase()}/`);
  const $c = cheerio.load(response);
  return $c('.bannerSubtitle')
    .text()
    .toLowerCase()
    .trim()
    .split(', ')
    .map(pos => {
      switch (pos) {
        case 'mid':
          return 'middle';
        case 'ad carry':
          return 'adc';
        case 'jungler':
          return 'jungle';
        default:
          return pos;
      }
    });
}

export async function getSr() {
  try {
    await championify.getItems();
    const champs = store.get('champs');

    const data = (
      await Promise.all(
        champs.map(async champ => {
          cl(`${T.t('processing')} LeagueOfGraphs: ${T.t(champ)}`);
          progressbar.incrChamp();

          try {
            const positions = await _getPositions(champ);
            const champData = await Promise.all(
              positions.map(async position => {
                try {
                  const [items, skills] = await Promise.all([_getItems(champ, position), _getSkills(champ, position)]);
                  const blocks = [
                    {
                      items: _arrayToBuilds(items.starter_items),
                      type: T.t('starter', true),
                    },
                    {
                      items: _arrayToBuilds(items.core_items),
                      type: T.t('core_items', true),
                    },
                    {
                      items: _arrayToBuilds(items.end_items),
                      type: T.t('endgame_items', true),
                    },
                    {
                      items: _arrayToBuilds(items.boots),
                      type: T.t('boots', true),
                    },
                  ];

                  const positionName = T.t(position, true);
                  const riot_json = {
                    ...default_schema,
                    champion: champ,
                    title: `LOG ${positionName} ${store.get('leagueofgraphs_ver')}`,
                    blocks: trinksCon(blocks, { highest_win: skills, most_freq: skills }),
                  };

                  return {
                    champ,
                    file_prefix: positionName,
                    riot_json,
                    source: 'leagueofgraphs',
                  };
                } catch (err) {
                  Log.warn(err);
                  store.push('undefined_builds', { champ, position, source: source_info.name });
                }
              })
            );
            return champData;
          } catch (err) {
            Log.warn(err);
            store.push('undefined_builds', { champ, position: 'All', source: source_info.name });
          }
        })
      )
    ).flat();

    store.push('sr_itemsets', data.filter(Boolean));
  } catch (err) {
    console.error(err);
  }
}

export async function getVersion() {
  const response = await request.get('http://www.leagueofgraphs.com/contact');
  const $c = cheerio.load(response);
  const version = $c('.patch').text().replace('Patch: ', '');
  store.set('leagueofgraphs_ver', version);
}
