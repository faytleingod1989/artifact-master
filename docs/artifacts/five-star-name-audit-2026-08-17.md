# 五星圣遗物套装中文名审计（2026-08-17）

审计对象：`apps/web/src/artifacts/catalog.snapshot.ts` 的 44 个 `setKey`。正式名以游戏简体中文数据为准；逐项以 [AnimeGameData 的 TextMapCHS.json](https://gitlab.com/Dimbreath/AnimeGameData/-/blob/433284d22ef1a704e9d49ae22fb96cf7a245828e/TextMap/TextMapCHS.json)（仓库修订 `433284d22ef1a704e9d49ae22fb96cf7a245828e`，2026-06-29）为主，并用 [Genshin Dictionary 圣遗物索引](https://genshin-dictionary.com/zh-CN/tags/artifact)（源仓库修订 `1254750f16d57a5a394a04034a15bb2248df1e8a`，2026-08-16）复核；争议项另以 [Honey Hunter 的悠古套](https://gensh.honeyhunterworld.com/i_n400154/?lang=CHS)、[纺月的夜歌](https://gensh.honeyhunterworld.com/i_n400371/?lang=CHS&ver=6_4_50) 和 [官方 6.0 更新说明](https://ys.mihoyo.com/main/news/detail/159361) 交叉核对。

共发现 **6 项更正**。`Changed` 表示 snapshot 当前值需要改为正式名。

| setKey | 当前中文名 | 正式中文名 | Changed |
|---|---|---|:---:|
| `shenlang-zhongqu` | 深廊终曲 | 深廊终曲 | — |
| `heiyao-midian` | 黑曜秘典 | 黑曜秘典 | — |
| `zhuying-lieren` | 逐影猎人 | 逐影猎人 | — |
| `xishi-zhige` | 昔时之歌 | 昔时之歌 | — |
| `a-day-carved-from-rising-winds` | 灼灼彩菊的芳香 | **风起之日** | 是 |
| `aubade-of-morningstar-and-moon` | 晨星与月的序曲 | **晨星与月的晓歌** | 是 |
| `night-of-the-skys-unveiling` | 长夜天光 | **穹境示现之夜** | 是 |
| `silken-moons-serenade` | 柔灯挽歌 | **纺月的夜歌** | 是 |
| `celestial-gift` | 天光之赐 | **天之美赐** | 是 |
| `disenchantment-in-deep-shadow` | 深黯之境的解离 | **影中沉凝的幻灭** | 是 |
| `emblem-of-severed-fate` | 绝缘之旗印 | 绝缘之旗印 | — |
| `husk-of-opulent-dreams` | 华馆梦醒形骸记 | 华馆梦醒形骸记 | — |
| `blizzard-strayer` | 冰风迷途的勇士 | 冰风迷途的勇士 | — |
| `thundering-fury` | 如雷的盛怒 | 如雷的盛怒 | — |
| `thundersoother` | 平息鸣雷的尊者 | 平息鸣雷的尊者 | — |
| `archaic-petra` | 悠古的磐岩 | 悠古的磐岩 | — |
| `bloodstained-chivalry` | 染血的骑士道 | 染血的骑士道 | — |
| `heart-of-depth` | 沉沦之心 | 沉沦之心 | — |
| `wanderers-troupe` | 流浪大地的乐团 | 流浪大地的乐团 | — |
| `ocean-hued-clam` | 海染砗磲 | 海染砗磲 | — |
| `lavawalker` | 渡过烈火的贤人 | 渡过烈火的贤人 | — |
| `crimson-witch-of-flames` | 炽烈的炎之魔女 | 炽烈的炎之魔女 | — |
| `viridescent-venerer` | 翠绿之影 | 翠绿之影 | — |
| `maiden-beloved` | 被怜爱的少女 | 被怜爱的少女 | — |
| `retracing-bolide` | 逆飞的流星 | 逆飞的流星 | — |
| `deepwood-memories` | 深林的记忆 | 深林的记忆 | — |
| `flower-of-paradise-lost` | 乐园遗落之花 | 乐园遗落之花 | — |
| `desert-pavilion-chronicle` | 沙上楼阁史话 | 沙上楼阁史话 | — |
| `nymphs-dream` | 水仙之梦 | 水仙之梦 | — |
| `vourukashas-glow` | 花海甘露之光 | 花海甘露之光 | — |
| `golden-troupe` | 黄金剧团 | 黄金剧团 | — |
| `nighttime-whispers-in-the-echoing-woods` | 回声之林夜话 | 回声之林夜话 | — |
| `scroll-of-the-hero-of-cinder-city` | 烬城勇者绘卷 | 烬城勇者绘卷 | — |
| `tenacity-of-the-millelith` | 千岩牢固 | 千岩牢固 | — |
| `noblesse-oblige` | 昔日宗室之仪 | 昔日宗室之仪 | — |
| `echoes-of-an-offering` | 来歆余响 | 来歆余响 | — |
| `pale-flame` | 苍白之火 | 苍白之火 | — |
| `gladiators-finale` | 角斗士的终幕礼 | 角斗士的终幕礼 | — |
| `vermillion-hereafter` | 辰砂往生录 | 辰砂往生录 | — |
| `shimenawas-reminiscence` | 追忆之注连 | 追忆之注连 | — |
| `gilded-dreams` | 饰金之梦 | 饰金之梦 | — |
| `fragment-of-harmonic-whimsy` | 谐律异想断章 | 谐律异想断章 | — |
| `unfinished-reverie` | 未竟的遐思 | 未竟的遐思 | — |
| `long-nights-oath` | 长夜之誓 | 长夜之誓 | — |

## 迁移别名

仅保留实际发生变更的旧输入名，解析后写入正式名：

| 历史/错误输入 | 正式名 | 适用 setKey |
|---|---|---|
| 灼灼彩菊的芳香 | 风起之日 | `a-day-carved-from-rising-winds` |
| 晨星与月的序曲 | 晨星与月的晓歌 | `aubade-of-morningstar-and-moon` |
| 长夜天光 | 穹境示现之夜 | `night-of-the-skys-unveiling` |
| 柔灯挽歌 | 纺月的夜歌 | `silken-moons-serenade` |
| 天光之赐 | 天之美赐 | `celestial-gift` |
| 深黯之境的解离 | 影中沉凝的幻灭 | `disenchantment-in-deep-shadow` |

备注：`悠古的磐岩` 在部分第三方词典中误列为“悠久的磐岩”，但 Honey Hunter 的简体中文游戏条目与官方历史公告均使用“悠古”，因此本审计不改该项。
