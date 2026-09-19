// 思想年代 · 权威目录（服务端唯一事实源）
// 年份采用天文纪年：公元前为负数。dateB/dateE 表示学界常用区间（dateE 为 null 表示存疑/传说）。

export const ERAS = [
  {
    id: 'axial',
    name: '轴心时代',
    en: 'The Axial Age',
    from: -551,
    to: -221,
    region: '黄河—爱琴海',
    color: '#b6603d',
    blurb: '人类几大文明同时开始对世界、伦理与自我作出系统的追问。',
  },
  {
    id: 'classical',
    name: '古典时代',
    en: 'The Classical World',
    from: -450,
    to: 300,
    region: '雅典—罗马—长安',
    color: '#c2923f',
    blurb: '学派成形：学园、漫步、斯多葛与儒家，把追问变成教育与生活方式。',
  },
  {
    id: 'faith',
    name: '信仰时代',
    en: 'The Age of Faith',
    from: 400,
    to: 1300,
    region: '巴格达—巴黎—临安',
    color: '#7d83a0',
    blurb: '理性为信仰辩护，也在信仰内部开出逻辑、法与心性的道路。',
  },
  {
    id: 'reason',
    name: '理性时代',
    en: 'The Age of Reason',
    from: 1300,
    to: 1780,
    region: '欧洲',
    color: '#6f8c6c',
    blurb: '方法、经验与主体重新奠基知识，旧秩序在批判中松动。',
  },
  {
    id: 'modern',
    name: '现代纪元',
    en: 'The Modern Era',
    from: 1780,
    to: 1945,
    region: '柯尼斯堡—巴黎—维也纳',
    color: '#536f7a',
    blurb: '理性开始审视自身的边界，历史、意志、语言与存在轮番登场。',
  },
  {
    id: 'contemporary',
    name: '当代之后',
    en: 'The Contemporary',
    from: 1945,
    to: 2010,
    region: '全球',
    color: '#8a6b8f',
    blurb: '语言、权力、解构与日常实践，把哲学交还给每一个具体的人。',
  },
];

// traditions 用于核对人物的「传统归属」；traditions 与所属展厅是两件事——
// 一个人只有一个主传统，但生命可以横跨两个展厅（借展）。
export const TRADITIONS = {
  confucian: { name: '儒家', eras: ['axial', 'classical', 'faith'] },
  daoist: { name: '道家', eras: ['axial', 'classical'] },
  greek: { name: '古希腊哲学', eras: ['axial', 'classical'] },
  hellenistic: { name: '希腊化哲学', eras: ['classical'] },
  scholastic: { name: '经院哲学', eras: ['faith'] },
  neoconfucian: { name: '理学', eras: ['faith'] },
  islamic: { name: '伊斯兰哲学', eras: ['faith'] },
  rationalist: { name: '理性主义', eras: ['reason'] },
  empiricist: { name: '经验主义', eras: ['reason'] },
  enlightenment: { name: '启蒙思想', eras: ['reason', 'modern'] },
  idealism: { name: '德国古典哲学', eras: ['modern'] },
  existentialism: { name: '存在主义', eras: ['modern', 'contemporary'] },
  phenomenology: { name: '现象学', eras: ['modern', 'contemporary'] },
  analytic: { name: '分析哲学', eras: ['modern', 'contemporary'] },
  structuralism: { name: '结构/后结构主义', eras: ['contemporary'] },
};

export const PEOPLE = [
  { id: 'confucius', name: '孔子', latin: 'Confucius', born: -551, died: -479, tradition: 'confucian', idea: '仁与礼', quote: '己所不欲，勿施于人。', note: '以对话确立了中国思想的伦理与教育基本语汇。' },
  { id: 'laozi', name: '老子', latin: 'Laozi', born: -571, died: -471, tradition: 'daoist', idea: '道与无为', quote: '道可道，非常道。', note: '其年代与生平存疑，传统上与孔子同时而年长。' },
  { id: 'socrates', name: '苏格拉底', latin: 'Socrates', born: -470, died: -399, tradition: 'greek', idea: '诘问法', quote: '未经审视的人生不值得过。', note: '不立文字，把哲学变成城邦街头的对话。' },
  { id: 'plato', name: '柏拉图', latin: 'Plato', born: -428, died: -348, tradition: 'greek', idea: '理念论', quote: '思考是灵魂与自己的对话。', note: '创办学园，追问感官世界背后的永恒形式。' },
  { id: 'aristotle', name: '亚里士多德', latin: 'Aristotle', born: -384, died: -322, tradition: 'greek', idea: '中道与逻辑', quote: '人是理性的动物。', note: '整理知识的版图，也为“怎样生活”给出实践学。' },
  { id: 'zhuangzi', name: '庄子', latin: 'Zhuangzi', born: -369, died: -286, tradition: 'daoist', idea: '齐物与逍遥', quote: '此亦一是非，彼亦一是非。', note: '把相对、梦与无用写进中国思想最自由的想象。' },
  { id: 'augustine', name: '奥古斯丁', latin: 'Augustine', born: 354, died: 430, tradition: 'scholastic', idea: '时间与意志', quote: '时间是什么？无人问我，我知道；有人问我，我茫然。', note: '在古典尽头把内在性、时间与恶带入信仰的语言。' },
  { id: 'averroes', name: '伊本·鲁世德', latin: 'Ibn Rushd (Averroës)', born: 1126, died: 1198, tradition: 'islamic', idea: '双重真理', quote: '哲学与真理并不相违。', note: '评注亚里士多德，理性与启示在他笔下各有其路。' },
  { id: 'aquinas', name: '托马斯·阿奎那', latin: 'Thomas Aquinas', born: 1225, died: 1274, tradition: 'scholastic', idea: '自然法', quote: '恩宠并不取消自然，而是成全自然。', note: '以亚里士多德体系综合信仰与理性。' },
  { id: 'zhuxi', name: '朱熹', latin: 'Zhu Xi', born: 1130, died: 1200, tradition: 'neoconfucian', idea: '格物穷理', quote: '即物而穷其理。', note: '集理学之大成，让儒家经典成为此后数百年的教材。' },
  { id: 'descartes', name: '笛卡尔', latin: 'René Descartes', born: 1596, died: 1650, tradition: 'rationalist', idea: '我思故我在', quote: '我思，故我在。', note: '以普遍怀疑寻找不容置疑的知识起点。' },
  { id: 'hume', name: '休谟', latin: 'David Hume', born: 1711, died: 1776, tradition: 'empiricist', idea: '经验与习惯', quote: '理性是、也只应当是激情的奴隶。', note: '把因果、自我与道德推向怀疑的边缘。' },
  { id: 'rousseau', name: '卢梭', latin: 'Jean-Jacques Rousseau', born: 1712, died: 1778, tradition: 'enlightenment', idea: '社会契约', quote: '人生而自由，却无往不在枷锁之中。', note: '在启蒙内部为自然、情感与公意辩护。' },
  { id: 'kant', name: '康德', latin: 'Immanuel Kant', born: 1724, died: 1804, tradition: 'idealism', idea: '批判哲学', quote: '头顶的星空与心中的道德法则，愈思索愈敬畏。', note: '为认识划界，也为自由与义务奠基。' },
  { id: 'hegel', name: '黑格尔', latin: 'G. W. F. Hegel', born: 1770, died: 1831, tradition: 'idealism', idea: '辩证法', quote: '密涅瓦的猫头鹰在黄昏才起飞。', note: '思想与历史是矛盾不断展开的过程。' },
  { id: 'nietzsche', name: '尼采', latin: 'Friedrich Nietzsche', born: 1844, died: 1900, tradition: 'existentialism', idea: '超人/永恒轮回', quote: '上帝死了。', note: '重估一切价值，把虚无主义变成岔路口而非终点。' },
  { id: 'husserl', name: '胡塞尔', latin: 'Edmund Husserl', born: 1859, died: 1938, tradition: 'phenomenology', idea: '回到事物本身', quote: '回到事物本身！', note: '以现象学还原，重新描述意识如何给出世界。' },
  { id: 'wittgenstein', name: '维特根斯坦', latin: 'Ludwig Wittgenstein', born: 1889, died: 1951, tradition: 'analytic', idea: '语言的界限', quote: '对于不可说者，必须保持沉默。', note: '前后期两次转向，重写了语言、逻辑与生活形式。' },
  { id: 'heidegger', name: '海德格尔', latin: 'Martin Heidegger', born: 1889, died: 1976, tradition: 'phenomenology', idea: '存在之问', quote: '语言是存在之家。', note: '把哲学带回“存在”本身与人的被抛处境。' },
  { id: 'sartre', name: '萨特', latin: 'Jean-Paul Sartre', born: 1905, died: 1980, tradition: 'existentialism', idea: '存在先于本质', quote: '人是被判处自由的。', note: '没有预设剧本，选择即责任。' },
  { id: 'foucault', name: '福柯', latin: 'Michel Foucault', born: 1926, died: 1984, tradition: 'structuralism', idea: '知识/权力', quote: '知识不是权力的工具，它本身就是权力关系。', note: '在疯癫、监狱与性中追问主体如何被塑造。' },
];

export const QUESTIONS = [
  { id: 'q-being', label: '什么存在？', hint: '本体论：万物之后是否有更根本的真实？', affinities: ['plato', 'aristotle', 'laozi', 'heidegger', 'zhuangzi'] },
  { id: 'q-knowledge', label: '知识从何而来？', hint: '认识论：经验、理性与语言，哪一个更可靠？', affinities: ['descartes', 'hume', 'kant', 'zhuxi', 'husserl', 'wittgenstein'] },
  { id: 'q-life', label: '应当怎样生活？', hint: '伦理学：德性、快乐、责任还是逍遥？', affinities: ['confucius', 'aristotle', 'socrates', 'sartre', 'zhuangzi'] },
  { id: 'q-self', label: '我是谁？', hint: '自我、意识与被抛的处境。', affinities: ['augustine', 'hume', 'nietzsche', 'sartre', 'heidegger'] },
  { id: 'q-order', label: '正义如何可能？', hint: '政治哲学：礼、契约与权力。', affinities: ['confucius', 'plato', 'rousseau', 'hegel', 'foucault'] },
  { id: 'q-god', label: '理性与信仰？', hint: '启示能否被论证？', affinities: ['augustine', 'aquinas', 'averroes', 'kant'] },
  { id: 'q-language', label: '语言能否说出真实？', hint: '语言、逻辑与意义的边界。', affinities: ['plato', 'wittgenstein', 'heidegger', 'foucault', 'laozi'] },
  { id: 'q-history', label: '历史有方向吗？', hint: '历史是循环、进步，还是矛盾的展开？', affinities: ['hegel', 'nietzsche', 'rousseau', 'confucius'] },
];

// 典册中的「师承/对话」关系，前端可据此绘制弧线；用户也可自定关系。
export const RELATIONS = [
  { from: 'socrates', to: 'plato', kind: '师承' },
  { from: 'plato', to: 'aristotle', kind: '师承' },
  { from: 'confucius', to: 'zhuangzi', kind: '对话' },
  { from: 'laozi', to: 'zhuangzi', kind: '承继' },
  { from: 'aristotle', to: 'aquinas', kind: '再发现' },
  { from: 'aristotle', to: 'averroes', kind: '评注' },
  { from: 'averroes', to: 'aquinas', kind: '传播' },
  { from: 'descartes', to: 'kant', kind: '论敌' },
  { from: 'hume', to: 'kant', kind: '惊醒' },
  { from: 'rousseau', to: 'kant', kind: '敬重' },
  { from: 'kant', to: 'hegel', kind: '承继' },
  { from: 'hegel', to: 'nietzsche', kind: '反叛' },
  { from: 'kant', to: 'husserl', kind: '回响' },
  { from: 'husserl', to: 'heidegger', kind: '师承' },
  { from: 'hegel', to: 'sartre', kind: '回响' },
  { from: 'heidegger', to: 'sartre', kind: '激发' },
  { from: 'heidegger', to: 'foucault', kind: '激发' },
  { from: 'nietzsche', to: 'foucault', kind: '承继' },
  { from: 'husserl', to: 'wittgenstein', kind: '对话' },
];

export const ERA_MAP = new Map(ERAS.map((e) => [e.id, e]));
export const PEOPLE_MAP = new Map(PEOPLE.map((p) => [p.id, p]));
export const QUESTION_MAP = new Map(QUESTIONS.map((q) => [q.id, q]));
export const TRADITION_MAP = new Map(Object.entries(TRADITIONS));
export const RELATION_MAP = new Map(RELATIONS.map((r) => [`${r.from}→${r.to}`, r]));

export function catalogPerson(id) {
  return PEOPLE_MAP.get(id) || null;
}

export function formatYear(y) {
  if (y < 0) return `前${-y}`;
  return `${y}`;
}

export function personSpan(p) {
  return { from: p.born, to: p.died };
}

// 人物生命的「归属展厅」：生命中点落在哪个展厅。
// 若横跨多个已收录展厅，其余作为借展（onLoan）。
export function homeEraForPerson(p) {
  const mid = (p.born + p.died) / 2;
  let home = null;
  const loans = [];
  for (const e of ERAS) {
    if (mid >= e.from && mid <= e.to) home = e.id;
  }
  if (!home) {
    // 落在展厅之间的空隙：归到最近的一个
    let best = null;
    let bestDist = Infinity;
    for (const e of ERAS) {
      const d = mid < e.from ? e.from - mid : mid > e.to ? mid - e.to : 0;
      if (d < bestDist) {
        bestDist = d;
        best = e.id;
      }
    }
    home = best;
  }
  for (const e of ERAS) {
    if (e.id !== home && p.died >= e.from && p.born <= e.to) loans.push(e.id);
  }
  return { home, loans };
}

export function traditionName(tid) {
  return TRADITIONS[tid]?.name ?? tid;
}
