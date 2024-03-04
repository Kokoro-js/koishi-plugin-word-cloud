import dayjs from 'dayjs';
import { DatabaseService } from 'koishi';

export class WordFrequencyCounter {
  public wordFrequency: Map<string, number>;
  public date: Date;
  public guildId: string;
  public hasSaved: boolean;

  constructor(guildId: string) {
    this.wordFrequency = new Map<string, number>();
    this.date = WordFrequencyCounter.getToday();
    this.guildId = guildId;
    this.hasSaved = false;
  }

  increment(words: string[]) {
    for (let word of words) {
      if (word == " ") return;
      this.wordFrequency.set(word, (this.wordFrequency.get(word) || 0) + 1);
    }
    this.hasSaved = false;
  }

  static getToday() {
    const now = dayjs();
    return now.startOf("day").toDate();
  }

  async doSave(database: DatabaseService) {
    let data = this.wordFrequency;
    const oldData = await database.get(
      "wordStats",
      {
        $and: [{ guildId: [this.guildId] }, { date: { $eq: this.date } }],
      },
      ["words"],
    );
    if (oldData.length != 0) {
      const old: Array<[string, number]> = oldData.flatMap((item) =>
        JSON.parse(item.words),
      );
      data = mergeCountMaps([arrayToMap(old), data]);
    }
    try {
      await database.upsert("wordStats", [
        {
          guildId: this.guildId,
          date: this.date,
          words: JSON.stringify(Array.from(data.entries())),
        },
      ]);
      this.wordFrequency.clear();
      this.date = WordFrequencyCounter.getToday();
      this.hasSaved = true;
    } catch (e) {
      console.error(e);
    }
  }
}

export function arrayToMap(arr: [string, number][]) {
  let map = new Map<string, number>();
  for (const [key, value] of arr) {
    map.set(key, (map.get(key) || 0) + value);
  }
  return map;
}

export function mergeCountMaps(maps: Map<string, number>[]) {
  return maps.reduce((acc, currMap) => {
    for (const [key, value] of currMap.entries()) {
      acc.set(key, (acc.get(key) || 0) + value);
    }
    return acc;
  }, new Map<string, number>());
}
