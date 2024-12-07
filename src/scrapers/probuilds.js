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
  name: 'ProBuilds',
  id: 'probuilds'
};

function getChamps() {
  return request({ url: 'https://probuilds.net/champions', json: true })
    .then(body => {
      const $ = cheerio.load(body);
      return $('.champion-name').map((_, el) => $(el).attr('href').split('/').pop()).get();
    });
}

function getIDs($, el) {
  return arrayToBuilds(el.find('.item').map((idx, entry) => $(entry).attr('data-id')).get());
}

function getTopKDAItems(champ) {
  const champ_id = store.get('champ_ids')[champ];
  return request({
    url: `https://probuilds.iesdev.com/graphql?query=query+ProBuildsMatchesForChampion($id:ID!, $first:Int){probuildChampion(id:$id){id matchCount pickRate winRate probuildMatches(first:$first){accountId assists boots{id}buildPaths{id itemId timestamp}champion deaths encryptedAccountId gameDuration gold id insertedAt items{id}kills lane opponentChampion patch player{id fame accounts insertedAt name portraitImageUrl profileImageUrl realName region slug team{id insertedAt name pictureUrl region tag updatedAt}teamId updatedAt win}}}&variables={"id":"${champ_id}","first":1}`, json: true
  })
    .then(response => response.data.probuildChampion.probuildMatches)
    .then(matches => matches.map(match => {
      const items = match.items.map(item => item.id);
      const player = match.player.name;
      const kills = match.kills;
      const assists = match.assists;
      const deaths = match.deaths;
      const kda = (kills + assists) / (deaths || 1); // Avoid division by zero

      return {
        player,
        items,
        kda,
        kda_text: `${kills} / ${deaths} / ${assists}`
      };
    }))
    .then(matches => matches.sort((a, b) => b.kda - a.kda))
    .then(matches => matches[0])
    .catch(err => {
      err = new ChampionifyErrors.ExternalError(`Probuilds failed to parse KDA for ${champ}`).causedBy(err);
      Log.warn(err);
      return null;
    });
}

function getItems(champ_case) {
  const champ = champ_case.toLowerCase();
  cl(`${T.t('processing')} ProBuilds: ${T.t(champ)}`);

  return Promise.all([
    request(`https://probuilds.net/champions/details/${champ_case}`).then(cheerio.load),
    getTopKDAItems(champ)
  ])
    .then(([ $, kda ]) => {
      const divs = $('.section.popular-section');
      const core = getIDs($, divs.eq(0));
      const boots = getIDs($, divs.eq(2));

      const riot_json = {
        ...default_schema,
        champion: champ,
        title: `ProBuilds ${moment().format('YYYY-MM-DD')}`,
        blocks: [
          {
            items: core,
            type: T.t('core_items', true)
          },
          {
            items: boots,
            type: T.t('boots', true)
          }
        ]
      };

      if (kda) riot_json.blocks.push({
        items: arrayToBuilds(kda.items),
        type: `${T.t('top_kda_items', true)} - ${kda.player}: ${kda.kda_text}`
      });

      riot_json.blocks = trinksCon(riot_json.blocks);
      progressbar.incrChamp();
      return { champ, file_prefix: 'all', riot_json, source: 'probuilds' };
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
