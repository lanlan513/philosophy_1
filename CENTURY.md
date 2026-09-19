# 我的思想年代 · A Personal Century

一条可以亲手编排的哲学时间线：像在展墙上挂画一样，拖动**时代节点、哲学家、核心问题**，
组合出属于自己的「思想年代」；右侧实时生成可阅读的展览预览。

**时间逻辑由服务端裁决**——客户端只负责摆放与即时反馈，年代、传统归属与关系是否成立，
一律以服务端典册（`server/catalog.mjs`）重新计算。

## 运行

```bash
# 方式一：生产模式（服务端同时托管构建产物，推荐）
npm run build
npm start                      # http://localhost:5174/century

# 方式二：开发模式（两个终端）
npm run dev:server             # :5174 权威 API
npm run dev                    # :5173 前端（/api 已配置代理）

# 测试（服务端校验/合并 11 项 + 客户端镜像 6 项）
npm test
```

数据存于 `.century-data/`（已 gitignore），每个策展档案一个 JSON 文件、原子写入。

## 展墙上有什么

- **时代节点（展厅）**：轴心时代 → 古典时代 → 信仰时代 → 理性时代 → 现代纪元 → 当代之后。
- **哲学家（画作）**：21 位中西思想家，带生卒年（公元前为负）、主传统、核心命题、语录。
- **核心问题（悬而未决）**：8 个问题，**不设年代门槛**，可挂在任何展厅制造陌生化对话。
- **关系弧线**：师承 / 承继 / 心传 / 对话 / 论敌 / 评注 / 再发现 / 反叛 / 回响……
  典册已录 19 条（标注「典册」来源），用户可自撰（标注「策展人自撰」，并置典册异说）。

## 两种形态

| | 桌面端 | 移动端 |
|---|---|---|
| 隐喻 | 横向展墙，强调空间感 | 上下阅读的长卷 |
| 时间轴 | 自绘 **SVG**：年份轴、展厅色带、人物弧线 | 左侧年份尺 + 展钉 |
| 排布 | HTML5 拖拽 | 显式按钮：↑↓ 排序、下拉选厅、取下/连线 |
| 预览 | 右侧 460px 实时展册 | 长卷之后的展册区 |

**可达性（拖拽的完整替代，而非妥协）**：卡片可聚焦，`↑↓` 排序、`Alt+←→` 跨厅；
库房每件藏品都有「挂墙」按钮 → 弹出选厅对话框；所有按钮带 `aria-label`，浮层为 `role="dialog"`。

## 服务端裁决了什么（`server/validate.mjs`）

- **硬错误（error，拒绝成版，HTTP 422）**
  - `person.anachronism` 人物生命与展厅年代零重叠（如把孔子挂进信仰时代）
  - `relation.direction` 师承方向错误（学生早于老师；跨世纪精神接续请用「心传」）
  - 未知人物 / 未知关系 / 挂入不存在的展厅（脏数据）
- **策展注记（warning，允许保存，写进展览墙签）**
  - `person.loan` 借展（主展厅之外但生命重叠，如康德挂现代纪元）
  - `era.order` 用户策展顺序与年代不符——**正式时间轴按年代，策展顺序另存**
  - `order.overlap` 同序撞车，按生年自动错开
  - `tradition.mismatch` 传统与展厅主流不符（鼓励，不阻止）
  - `relation.kind` 与典册记载不同（并陈两种来源）
  - `question.affinity` 问题挂到没有其对话者的展厅
  - 主展厅缺席时的访客提示

保存后返回的 `current.state` 是服务端规范化结果，会回写本地（例如重复展厅被合并）。

## 边界情形如何处理

| 情形 | 处理 |
|---|---|
| **并发编辑** | 乐观版本号 `baseVersion`。落后提交 → `409 version_conflict`，弹出**合并台** |
| **三路合并** | 服务端取 `base / server / client` 做 three-way merge：不同字段自动合；同字段分叉（画作各挂一处、一方删一方留、标题两改）列出逐项裁决，也可一键「全用墙上 / 全保留我的」。落版后再跑硬校验 |
| **节点重叠** | 提交时同序号自动按生年裁决并给注记；客户端重排每次都在展厅内重新连续编号 |
| **拖拽中断** | `dragend`/失焦即清理拖影与投放高亮，不产生半成品；未落入有效区则原序不动 |
| **旧版本覆盖** | 版本链**只增不改**，旧版永不被覆盖；旧 base 提交被 409 拒绝。任何旧版可「调出」成为新编辑底稿，保存即新版本 |
| **保存成功、预览失败** | 保存与渲染是**两个独立步骤**：commit 内 try/catch 渲染，版本先落库，返回 `previewError`；UI 顶部显示「已入库·预览待重试」，可单独重渲染（`/api/preview?fail=1` 可演示 503） |
| **离线后重合并** | 编辑写入 localStorage 暂存；断网状态徽标提示；重新上线后：无并发→普通提交，有并发→合并台。断网启动用缓存典册，服务端不可达时给出启动指引 |

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/catalog` | 只读典册（时代/传统/人物/问题/关系） |
| POST | `/api/validate` | 对候选状态做完整裁决（不入库） |
| POST | `/api/preview[?fail=1]` | 独立渲染展览预览（可强制失败演练） |
| POST | `/api/galleries` | 建馆（可带 seedOps） |
| GET | `/api/galleries/:id` | 当前正式状态 + 版本元信息 |
| GET | `/api/galleries/:id/versions/:v` | 某一版完整快照（三路合并的分叉点） |
| POST | `/api/galleries/:id/commit` | 乐观提交：先硬校验，再追加版本（422/409/200） |
| POST | `/api/galleries/:id/merge` | 三路合并：`manual` 预演 / `server` / `client` 落版 |
| POST | `/api/galleries/:id/preview` | 按给定状态渲染（预览失败时单独重试） |

## 代码结构

```
server/
  catalog.mjs        权威典册（唯一事实源）：年代/人物/问题/关系/归属
  validate.mjs       applyOps + validateState（硬错误/注记）+ threeWayMerge
  preview.mjs        独立展览渲染（墙签/弧线目录/策展注记/版权页）
  store.mjs          文件版本库：只增版本链、每馆互斥锁、原子写
  index.mjs          HTTP API + 静态托管
  *.test.mjs         11 项服务端测试
src/century/
  CenturyPage.jsx    编排台（桌面/移动）
  Timeline.jsx       SVG 展墙 + HTML5 拖拽 + 键盘操作
  ScrollView.jsx     移动长卷
  Palette.jsx        库房（拖拽源 + 可达按钮）
  PreviewPane.jsx    右侧展册 + 校验条 + 裁决抽屉
  ConflictDialog.jsx 合并台
  RelationEditor.jsx 弧线编辑（来源并陈）
  VersionDrawer.jsx  版本史（只增不改）
  TargetPicker.jsx   无拖拽时的选厅对话框
  useCentury.js      状态/乐观版本/离线暂存/重合并/保存-预览分离
  applyOps.js        客户端镜像（即时反馈用，最终以服务端为准）
```

> 设计原则一句话：**策展自由归用户，时间事实归档案馆。**
