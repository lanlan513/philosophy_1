# 我的思想年代 · A Personal Century

一条可以被亲手编排的哲学时间线：把时代节点、哲学家和核心问题像挂画一样拖上展墙，
右侧实时生成可阅读的展览预览；服务端保存每个版本并裁决全部时间逻辑。

## 运行

```bash
npm install
npm run server   # 服务端 http://localhost:8080（同时托管已构建的前端）
npm run build    # 构建前端到 dist/（server 会自动托管）
npm run dev      # 开发模式（Vite，已代理 /api → 8080）
npm test         # 边界情况端到端测试（需 server 已启动）
```

打开 `http://localhost:8080`（默认时间线 `my-century`，可用 `?t=<id>` 切换/共享）。

## 架构

```
server/
  catalog.mjs   目录数据（时代 / 哲学家 / 问题，服务端为唯一权威）
  domain.mjs    校验（人物年代、传统归属、节点关系）、防重叠车道布局、三方合并、服务端预览
  store.mjs     JSON 持久化（原子写入）、版本历史、幂等键
  server.mjs    零依赖 HTTP：REST API + 静态托管
  test.mjs      19 项边界情况测试
src/
  App.jsx       保存状态机：CAS 乐观锁 / 409 冲突 / 离线草稿 / 自动重合并 / 422 标红
  Timeline.jsx  桌面 SVG 展墙（指针拖拽 + 键盘替代）与移动端纵向长卷
  Palette.jsx   展品目录（拖拽或按钮挂上）
  Preview.jsx   实时展览预览，本地渲染失败时自动降级为服务端兜底预览
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/catalog` | 目录 |
| GET | `/api/timelines/:id` | 当前版本 + 服务端布局 |
| PUT | `/api/timelines/:id` | 保存：`{baseVersion, nodes, clientId, idempotencyKey, strategy?}` |
| GET | `/api/timelines/:id/versions` | 版本历史 |
| GET | `/api/timelines/:id/preview` | 服务端渲染的展览文本（兜底） |

## 边界情况处理

- **并发编辑**：`baseVersion` 乐观锁，过期提交返回 `409` + 服务器现状，客户端选择重载或合并。
- **旧版本覆盖**：同上，服务端绝不接受过期基线的静默覆盖。
- **离线后重新合并**：`strategy:"rebase"` 触发三方合并（基线来自服务端版本历史），冲突逐节点记录；客户端断网时写 localStorage 草稿，恢复在线自动 rebase。
- **节点重叠**：服务端按年份区间做贪心车道分配并下发 `layout`，客户端只渲染不裁决。
- **拖拽中断**：`pointercancel` / `Esc` / 窗口失焦均取消拖拽并还原；自动保存有 1.5s 防抖。
- **保存成功但预览失败**：预览渲染包裹在异常边界内，失败时自动切换 `GET /preview` 服务端兜底，再失败则展示原始数据并保留“已保存”状态。
- **重复提交**：`idempotencyKey` 幂等重放，网络重试不会产生重复版本。
- **校验**：人物锚点须在生卒年内、时代归属须生平相交（错误）与传统相符（警告）、问题锚点须在所属人物生平内、禁止成环/重复/问题挂子节点——全部由服务端裁决（422），客户端标红定位。
