export default class BaseScraper {
    constructor(name, id) {
        this.name = name;
        this.id = id;
    }

    async getVersion() {
        const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
        if (!response.ok) {
            throw new Error('Failed to fetch versions from DDragon API');
        }
        const versions = await response.json();
        return versions[0];
    }
}
  