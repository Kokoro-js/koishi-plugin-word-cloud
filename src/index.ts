import { Context, DatabaseService, h, Schema } from "koishi";
import {} from "koishi-plugin-jieba";
import {} from "koishi-plugin-puppeteer";
import {} from "koishi-plugin-skia-canvas";
import createWordCloud from "./wordcloud.js";
import { readFileSync } from "fs";
import dayjs from "dayjs";
import { WordFrequencyCounter, arrayToMap, mergeCountMaps } from "./counter";

export const name = "word-cloud";
export const inject = ["jieba"];

export interface Config {
  maskImg: string;
  canvas: boolean;
  width: number;
  height: number;
  filter: string[];
  doRemoveSingle: boolean;
}

declare module "koishi" {
  interface Tables {
    wordStats: WordStats;
  }
}

export interface WordStats {
  guildId: string;
  date: Date;
  words: any;
}

export const Config: Schema<Config> = Schema.object({
  maskImg: Schema.string()
    .description("完整词云用的遮罩图片")
    .default("https://s2.loli.net/2023/07/26/blf6dONKDMrch5a.png"),
  canvas: Schema.boolean()
    .default(true)
    .description(
      "cloud 命令是否默认使用 Canvas，启用则需要 --full 来渲染完整图",
    ),
  width: Schema.natural().default(800).description("Canvas 宽度"),
  height: Schema.natural().default(800).description("Canvas 高度"),
  filter: Schema.array(String)
    .role("table")
    .default(["了", "的"])
    .description("过滤不想记录的词"),
  doRemoveSingle: Schema.boolean().default(false).description("是否移除单字。"),
});

export function apply(ctx: Context, config: Config) {
  ctx.i18n.define("zh", require("./locales/zh-CN"));

  ctx.model.extend(
    "wordStats",
    {
      guildId: "string",
      date: "date",
      words: "json",
    },
    { primary: "guildId" },
  );

  let wordCounterMap = new Map<string, WordFrequencyCounter>();
  const templateHtmlPath = __dirname + "/wordcloud.html";
  const templateHtml = readFileSync(templateHtmlPath).toString();
  const filter = new Set(config.filter);

  ctx.on("message", async (session) => {
    if (!session.guildId || session.selfId == session.userId) return;
    const preprocessText = h
      .transform(session.content, { text: true, default: false })
      .replace(/\n/g, " ");
    let content = ctx.jieba.cut(preprocessText);

    if (filter.size !== 0) {
      content = content.filter((word) => !filter.has(word));
    }

    if (config.doRemoveSingle) {
      content = content.filter((word) => word.length !== 1);
    }

    let wordCounter = wordCounterMap.get(session.guildId);
    if (!wordCounter) {
      wordCounter = new WordFrequencyCounter(session.guildId);
      wordCounterMap.set(session.guildId, wordCounter);
    }
    // Update the word frequency
    wordCounter.increment(content);

    const today = WordFrequencyCounter.getToday();
    // Check if need to save data and reset
    if (today.getDate() != wordCounter.date.getDate()) {
      await wordCounter.doSave(ctx.database);
    }
  });

  ctx.on("dispose", () => {
    wordCounterMap.forEach((e) => e.doSave(ctx.database));
  });
  ctx.inject(["canvas"], (ctx) => {
    ctx
      .command("cloud")
      .option("term", "-t <term:string>")
      .option("fast", "-f", { fallback: config.canvas })
      .option("fast", "--full", { value: false })
      .option("remove", "-r", { fallback: false })
      .option("guild", "<guild:string>")
      .action(async ({ options, session }) => {
        let guildId = options.guild || session.guildId;
        if (!guildId) return "在非群组中使用应指定 guildId";
        const wordCounter = wordCounterMap.get(guildId);
        if (!wordCounter) return "未记录数据";
        let wordsCache: Map<string, number> = wordCounter.wordFrequency;

        // 按选项对词云追溯范围作分别
        let dateExp,
          title = `${session.platform} - ${guildId} `;

        const day = dayjs(wordCounter.date);
        if (options.term) {
          const regex = /^(\d+)([dw])$/;
          const match = options.term.match(regex);
          const value = parseInt(match[1]);
          if (
            isNaN(value) ||
            !["d", "D", "w", "M", "y", "h", "m", "s", "ms"].includes(match[2])
          )
            return "传入的参数不对";

          let pendingAgo = day.subtract(value, match[2] as any);
          dateExp = { $gte: pendingAgo.toDate() };
          title += `${pendingAgo.format("YYYY-MM-DD")} - ${day.format(
            "YYYY-MM-DD",
          )}`;
        } else {
          dateExp = { $eq: wordCounter.date };
          title += day.format("YYYY-MM-DD");
        }

        // 数据库操作
        const oldData = await ctx.database.get(
          "wordStats",
          {
            $and: [{ guildId: [guildId] }, { date: dateExp }],
          },
          ["words"],
        );

        if (oldData.length != 0) {
          const old: Array<[string, number]> = oldData.flatMap((item) => {
            try {
              return JSON.parse(item.words);
            } catch (e) {
              return item.words;
            }
          });
          wordsCache = mergeCountMaps([arrayToMap(old), wordsCache]);
        }

        let list = Array.from(wordsCache.entries());

        if (options.remove) {
          list = list.filter(([key]) => key.length !== 1);
        }

        if (options.fast && ctx.canvas) {
          const WordCloud = createWordCloud(ctx.canvas.createCanvas(1, 1));
          const colorPanel = [
            "#54b399",
            "#6092c0",
            "#d36086",
            "#9170b8",
            "#ca8eae",
            "#d6bf57",
            "#b9a888",
            "#da8b45",
            "#aa6556",
            "#e7664c",
          ];
          const options = {
            gridSize: 8, // 设置网格大小，默认为8
            rotationRange: [-70, 70], // 设置旋转范围，默认为 [-70, 70]
            backgroundColor: "#fff", // 设置背景颜色，默认为 rgba(255,0,0,0.3)
            sizeRange: [24, 70], // 设置字体大小范围，默认为 [16, 68]
            color: function (word, weight) {
              // 字体颜色（非必需，这里会为词汇随机挑选一种 colorPanel 中的颜色）
              return colorPanel[Math.floor(Math.random() * colorPanel.length)];
            },
            fontWeight: "bold", // 字体粗细，默认为 'normal'
            fontFamily: `${ctx.canvas.getPresetFont()}`,
            shape: "square", // 字体形状，默认为 'circle'
          };
          const canvas = ctx.canvas.createCanvas(config.width, config.height);
          const wordcloud = WordCloud(canvas, { list, ...options });
          wordcloud.draw();
          return h.image(canvas.toBuffer("image/png"), "image/png");
        }

        if (ctx.puppeteer) {
          return await ctx.puppeteer.render(
            templateHtml
              .replace("${title}", title)
              .replace("${wordsArray}", JSON.stringify(list))
              .replace("${postMaskImagine}", `'${config.maskImg}'`),
          );
        }
      });
  });

  ctx
    .command("wordclear")
    .option("min", "<min:Date>")
    .option("max", "<max:Date>")
    .option("guild", "<guild:string>")
    .action(async ({ options, session }) => {
      let guildId = options.guild || session.guildId;
      if (!guildId) return "在非群组中使用应指定 guildId";
      let dateExp: any = {
        ...(options.min ? { $gte: options.min } : {}),
        ...(options.max ? { $lte: options.max } : {}),
      };
      if (Object.keys(dateExp).length === 0) {
        const time = new Date();
        time.setHours(0, 0, 0, 0);
        dateExp = { $eq: time };
      }
      await ctx.database.remove("wordStats", {
        $and: [{ guildId: [guildId] }, { date: dateExp }],
      });
    });
}
