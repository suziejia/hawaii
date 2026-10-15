# Hawaii 🍏

> 少即是多。每天 3 分鐘，把雅思 8 分語塊練成肌肉記憶。

**Hawaii** 是一款本地優先（local-first）的雅思語塊默寫訓練器：內容直接來自你的 Notion 學習筆記，通過「選詞積木 → 盲打拼寫 → 原位摳空」三階闖關，配合艾賓浩斯間隔重複與多鄰國式連勝打卡，讓高分表達真正留下來。

## 特性

- **Notion 即內容源**：遞歸拉取 Notion 頁面，自動切片課時、提取雙語題目、加粗語塊與詞彙表；支持手動一鍵同步
- **原位摳空默寫**：文章不刷新，語塊在原位化身輸入框，7 詞一組雙段推進，焦點全鍵盤流轉
- **艾賓浩斯記憶引擎**：Lv.0–4 掌握度梯（1/3/7/60 天間隔），錯詞自動降級，Mastered 語塊入庫
- **遊戲化打卡**：連勝火苗、月曆水波紋、里程碑寶箱、每日州文化印章
- **極速複習 / 詞庫**：到期語塊單卡速刷；Mastered 金卡資產字典帶原生朗讀（UK/US）
- **零外部服務依賴**：數據全部存本地 localStorage，音效由 Web Audio 實時合成

## 技術棧

Next.js (App Router) · React · TypeScript · Tailwind CSS · Drizzle ORM · PostgreSQL · Notion API · Web Audio / Web Speech

## 運行

```bash
npm install
npm run build
npm start          # http://localhost:3000
```

### 環境變量（.env）

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
NOTION_TOKEN=ntn_xxx        # Notion Internal Integration Secret
NOTION_PAGE_ID=xxxxxxxx     # 學習筆記頁面 ID（需分享給集成）
```

> 頁面結構約定：頁面標題為年份分組（如「2026年」），月份 toggle（九月/十月…）為子分組，每課以 💡 Callout 問題開頭，英文回答加粗處即為默寫語塊，文末列表為詞彙表。

## License

MIT
