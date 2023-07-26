import {Context, Database, DatabaseService, Schema} from 'koishi'
import {} from 'koishi-plugin-jieba'
import {} from 'koishi-plugin-puppeteer'
import {readFileSync} from "fs";

export const name = 'word-cloud'
export const using = ['puppeteer']

export interface Config {
  maskImg: string
}

declare module 'koishi' {
  interface Tables {
    wordStats: WordStats
  }
}

export interface WordStats {
  guildId: string
  date: Date
  words: string
}

export const Config: Schema<Config> = Schema.object({
  maskImg: Schema.string().description('词云用的遮罩图片').default('https://s2.loli.net/2023/07/26/blf6dONKDMrch5a.png')
})

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('wordStats', {
    guildId: 'string',
    date: 'date',
    words: 'string'
  }, { primary: 'guildId', unique: ['date', 'guildId'],})

  let wordCounterMap = new Map<string, WordFrequencyCounter>();
  const templateHtmlPath = __dirname + "/wordcloud.html";
  const templateHtml = readFileSync(templateHtmlPath).toString();

  ctx.on("message", async (session) => {
    if (!session.guildId || session.selfId == session.userId) return;
    // 对消息预处理，避免出现奇特字符让 puppeteer 无法工作
    const preprocessText = session.content.replace(/\n/g, ' ')
    const content = ctx.jieba.cut(preprocessText);

    let wordCounter = wordCounterMap.get(session.guildId);
    if (!wordCounter) {
      wordCounter = new WordFrequencyCounter(session.guildId);
      wordCounterMap.set(session.guildId, wordCounter);
    }
    // Update the word frequency
    wordCounter.increment(content);

    const today = new Date().getDate()
    // Check if need to save data and reset
    if (today != wordCounter.date.getDate()) {
      await wordCounter.doSave(ctx.database);
    }
  });

  ctx.on("dispose", () => {
    wordCounterMap.forEach(e => e.doSave(ctx.database))
  })

  ctx.command('cloud').option('week', '-w')
    .option('guild', '<guild:string>')
    .action(async ({options, session}) => {
      let guildId = options.guild || session.guildId
      if (!guildId) return '在非群组中使用应指定 guildId'
      const wordCounter = wordCounterMap.get(guildId)
      if (!wordCounter) return '未记录数据'
      let wordsCache: Map<string, number> = wordCounter.wordFrequency;

      // 按选项对词云追溯范围作分别
      let dateExp, title = `${session.platform} - ${guildId} `;
      if (options.week) {
        let time = wordCounter.date.getTime() - 7 * 24 * 60 * 60 * 1000
        let newDate = new Date(time)
        dateExp = {$gte: newDate}
        title += `${newDate.toISOString().split('T')[0]} - ${wordCounter.date.toISOString().split('T')[0]}`
      } else {
        dateExp = { $eq: wordCounter.date }
        title += wordCounter.date.toISOString().split('T')[0]
      }

      // 数据库操作
      const oldData = await ctx.database.get('wordStats', {
        $and: [
          {guildId: [guildId]},
          { date: dateExp }
        ]
      }, ['words'])

      if (oldData.length != 0) {
        wordsCache = mergeCountMaps([convertData(oldData), wordsCache])
      }

      return (await ctx.puppeteer.render(templateHtml
        .replace('${title}', title)
        .replace('${wordsArray}', JSON.stringify(Array.from(wordsCache.entries())))
        .replace('${postMaskImagine}', `'${config.maskImg}'`)))
  })

  ctx.command('wordclear')
    .option('min', '<min:Date>').option('max', '<max:Date>')
    .option('guild', '<guild:string>')
    .action(async ({options, session}) => {
      let guildId = options.guild || session.guildId
      if (!guildId) return '在非群组中使用应指定 guildId'
      let dateExp: any = {
        ...options.min ? {$gte: options.min} : {},
        ...options.max ? {$lte: options.max} : {},
      }
      if (Object.keys(dateExp).length === 0) {
        const time = new Date()
        time.setHours(0, 0, 0, 0)
        dateExp = { $eq: time }
      }
      await ctx.database.remove('wordStats', {
        $and: [
          {guildId: [guildId]},
          { date: dateExp }
        ]
      })
  })
}

function convertData(data: { words: string }[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of data) {
    const parsedData: any[][] = JSON.parse(item.words);
    parsedData.forEach(([key, value]) => {
      result.set(key, value);
    });
  }
  return result;
}

class WordFrequencyCounter {
  public wordFrequency: Map<string, number>;
  public date: Date;
  public guildId: string;
  public hasSaved: boolean;

  constructor(guildId: string) {
    this.wordFrequency = new Map<string, number>();
    this.date = this.getToday()
    this.guildId = guildId;
    this.hasSaved = false;
  }

  increment(words: string[]) {
    for (const word of words) {
      this.wordFrequency.set(word, (this.wordFrequency.get(word) || 0) + 1);
    }
    this.hasSaved = false;
  }

  getToday() {
    const time = new Date()
    time.setHours(0, 0, 0, 0)
    return time
  }

  async doSave(database: DatabaseService) {
    let data = this.wordFrequency
    const oldData = (await database.get('wordStats', {
      $and: [
        {guildId: [this.guildId]},
        { date: { $eq: this.date } },
      ]
    }, ['words']))
    if (oldData.length != 0) {
      data = mergeCountMaps([convertData(oldData), data])
    }
    try {
      await database.upsert('wordStats', [
        {guildId: this.guildId, date: this.date, words: JSON.stringify(Array.from(data.entries()))}
      ])
      this.wordFrequency.clear();
      this.date = this.getToday()
      this.hasSaved = true;
    } catch (e) {
      console.error(e)
    }
  }
}

function mergeCountMaps(maps: Map<string, number>[]) {
  return maps.reduce((acc, currMap) => {
    for (const [key, value] of currMap.entries()) {
      acc.set(key, (acc.get(key) || 0) + value);
    }
    return acc;
  }, new Map<string, number>());
}
