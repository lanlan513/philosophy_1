// 思想年代 · 目录数据（服务端为唯一权威来源）
// 年份约定：公元前为负数。floruit 不详的人物以生卒年为准。

export const eras = [
  { id: 'ancient',      name: '古希腊古典时期', start: -800, end: -300, traditions: ['古希腊'] },
  { id: 'hellenistic',  name: '希腊化与罗马',   start: -300, end: 300,  traditions: ['古希腊', '斯多亚'] },
  { id: 'medieval',     name: '中世纪',         start: 300,  end: 1400, traditions: ['基督教哲学'] },
  { id: 'earlymodern',  name: '近代早期',       start: 1400, end: 1650, traditions: ['理性主义', '经验主义'] },
  { id: 'enlightenment',name: '启蒙时代',       start: 1650, end: 1800, traditions: ['理性主义', '经验主义', '德国观念论'] },
  { id: 'c19',          name: '十九世纪',       start: 1780, end: 1900, traditions: ['德国观念论', '马克思主义', '唯意志论'] },
  { id: 'c20',          name: '二十世纪至今',   start: 1900, end: 2026, traditions: ['分析哲学', '现象学', '存在主义', '女性主义'] },
];

export const philosophers = [
  { id: 'socrates',     name: '苏格拉底',     birth: -470, death: -399, traditions: ['古希腊'],               summary: '未经省察的生活不值得过。' },
  { id: 'plato',        name: '柏拉图',       birth: -428, death: -348, traditions: ['古希腊'],               summary: '理念世界的守门人。' },
  { id: 'aristotle',    name: '亚里士多德',   birth: -384, death: -322, traditions: ['古希腊'],               summary: '百科全书式的秩序建立者。' },
  { id: 'epicurus',     name: '伊壁鸠鲁',     birth: -341, death: -270, traditions: ['古希腊'],               summary: '快乐是免除痛苦与纷扰。' },
  { id: 'zeno',         name: '芝诺（斯多亚）', birth: -334, death: -262, traditions: ['古希腊', '斯多亚'],   summary: '顺应自然而生。' },
  { id: 'augustine',    name: '奥古斯丁',     birth: 354,  death: 430,  traditions: ['基督教哲学'],           summary: '时间在心灵之中延展。' },
  { id: 'aquinas',      name: '阿奎那',       birth: 1225, death: 1274, traditions: ['基督教哲学'],           summary: '信仰与理性的综合。' },
  { id: 'descartes',    name: '笛卡尔',       birth: 1596, death: 1650, traditions: ['理性主义'],             summary: '我思故我在。' },
  { id: 'spinoza',      name: '斯宾诺莎',     birth: 1632, death: 1677, traditions: ['理性主义'],             summary: '神即自然，自由即必然的认识。' },
  { id: 'locke',        name: '洛克',         birth: 1632, death: 1704, traditions: ['经验主义'],             summary: '心灵始于白板。' },
  { id: 'hume',         name: '休谟',         birth: 1711, death: 1776, traditions: ['经验主义'],             summary: '因果只是习惯的联想。' },
  { id: 'kant',         name: '康德',         birth: 1724, death: 1804, traditions: ['德国观念论', '理性主义'], summary: '人为自然立法。' },
  { id: 'hegel',        name: '黑格尔',       birth: 1770, death: 1831, traditions: ['德国观念论'],           summary: '密涅瓦的猫头鹰在黄昏起飞。' },
  { id: 'schopenhauer', name: '叔本华',       birth: 1788, death: 1860, traditions: ['唯意志论'],             summary: '世界是意志的表象。' },
  { id: 'marx',         name: '马克思',       birth: 1818, death: 1883, traditions: ['马克思主义'],           summary: '问题在于改变世界。' },
  { id: 'nietzsche',    name: '尼采',         birth: 1844, death: 1900, traditions: ['唯意志论'],             summary: '上帝已死，价值重估。' },
  { id: 'russell',      name: '罗素',         birth: 1872, death: 1970, traditions: ['分析哲学'],             summary: '逻辑是哲学的本质。' },
  { id: 'wittgenstein', name: '维特根斯坦',   birth: 1889, death: 1951, traditions: ['分析哲学'],             summary: '语言的界限即世界的界限。' },
  { id: 'heidegger',    name: '海德格尔',     birth: 1889, death: 1976, traditions: ['现象学', '存在主义'],   summary: '人是向死而生的此在。' },
  { id: 'sartre',       name: '萨特',         birth: 1905, death: 1980, traditions: ['存在主义', '现象学'],   summary: '存在先于本质。' },
  { id: 'beauvoir',     name: '波伏娃',       birth: 1908, death: 1986, traditions: ['存在主义', '女性主义'], summary: '女人不是天生的，而是成为的。' },
];

export const questions = [
  { id: 'q-good-life', text: '什么是好的生活？',   themes: ['古希腊', '斯多亚'] },
  { id: 'q-knowledge', text: '知识从何而来？',     themes: ['理性主义', '经验主义'] },
  { id: 'q-being',     text: '存在意味着什么？',   themes: ['现象学', '存在主义', '古希腊'] },
  { id: 'q-freedom',   text: '自由与必然如何调和？', themes: ['德国观念论', '存在主义', '理性主义'] },
  { id: 'q-language',  text: '语言如何塑造世界？', themes: ['分析哲学'] },
  { id: 'q-justice',   text: '正义要求什么？',     themes: ['古希腊', '马克思主义', '女性主义'] },
  { id: 'q-time',      text: '时间是什么？',       themes: ['基督教哲学', '现象学', '古希腊'] },
  { id: 'q-self',      text: '自我是否存在？',     themes: ['经验主义', '现象学', '德国观念论'] },
];

export const catalog = { eras, philosophers, questions };

export function refOf(kind, refId) {
  const table = kind === 'era' ? eras : kind === 'philosopher' ? philosophers : questions;
  return table.find((r) => r.id === refId) || null;
}
