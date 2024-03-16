# koishi-plugin-word-cloud

[![npm](https://img.shields.io/npm/v/koishi-plugin-word-cloud?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-word-cloud)

Koishi 的词云插件，使用 [Jieba](https://github.com/ahdg6/koishi-plugin-jieba)

- help cloud
```
指令：cloud
查询本群词云
cloud -t 1w 以机器人记录的一周词数为界限生成词云
cloud -t 10m --full 以10分钟内的记录词数生成词云并用 puppeteer 渲染。
可用的选项有：
    -t, --term <term>  检索时间，从现在往前追溯，支持 数字+`d | D | w | M | y | h | m | s | ms`
    -f, --fast  -f 表示用 canvas 渲染，--full 表示用 puppeteer 渲染。
    --full
    --guild <guild>  指定特定 guild 来生成词云。
```

- help wordclear
```
指令：wordclear
清除本群的记录词数
wordclear 清除今日词云。
```

## Credits

[[GitHub - daidr/node-wordcloud: Tag cloud presentation for NodeJS (Based on wordcloud2.js)](https://github.com/daidr/node-wordcloud)]  --- 复制 Canvas 实现

[[GitHub - holanlan/b2wordcloud: js wordcloud 词云图, 基于wordcloud2.js, 增强若干特性，如渐变色，阴影，图片形状，tooltip](https://github.com/holanlan/b2wordcloud)] --- HTML 实现
