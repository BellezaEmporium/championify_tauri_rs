use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ItemSet {
    #[serde(rename = "associatedChampions")]
    pub associated_champions: Vec<i32>,
    
    #[serde(rename = "associatedMaps")]
    pub associated_maps: Vec<i32>,
    
    pub blocks: Vec<ItemBlock>,
    
    pub map: String,
    pub mode: String,
    
    #[serde(rename = "preferredItemSlots")]
    pub preferred_item_slots: Vec<serde_json::Value>,
    
    #[serde(rename = "sortrank")]
    pub sort_rank: i32,
    
    #[serde(rename = "startedFrom")]
    pub started_from: String,
    
    pub title: String,
    
    #[serde(rename = "type")]
    pub item_set_type: String,
    
    pub uid: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ItemBlock {
    #[serde(rename = "hideIfSummonerSpell")]
    pub hide_if_summoner_spell: String,
    
    pub items: Vec<BlockItem>,
    
    #[serde(rename = "showIfSummonerSpell")]
    pub show_if_summoner_spell: String,
    
    #[serde(rename = "type")]
    pub block_type: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BlockItem {
    pub count: i32,
    pub id: String,
}

impl ItemSet {
    pub fn new(champion_id: i32, title: String) -> Self {
        ItemSet {
            associated_champions: vec![champion_id],
            associated_maps: vec![11], // Summoner's Rift default
            blocks: Vec::new(),
            map: "SR".to_string(),
            mode: "any".to_string(),
            preferred_item_slots: Vec::new(),
            sort_rank: 9999,
            started_from: "blank".to_string(),
            title,
            item_set_type: "custom".to_string(),
            uid: Uuid::new_v4().to_string(),
        }
    }

    pub fn add_block(&mut self, block: ItemBlock) {
        self.blocks.push(block);
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }
}

impl ItemBlock {
    pub fn new(block_type: String) -> Self {
        ItemBlock {
            hide_if_summoner_spell: "".to_string(),
            items: Vec::new(),
            show_if_summoner_spell: "".to_string(),
            block_type,
        }
    }

    pub fn add_item(&mut self, item_id: String, count: i32) {
        self.items.push(BlockItem { 
            id: item_id, 
            count 
        });
    }
}