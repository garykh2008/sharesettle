# ShareSettle 💸

> 多幣別旅遊分帳 · 即時同步 · 個人大頭貼 · PWA 通知

ShareSettle 是一款專為旅遊、聚餐等多人活動設計的**分帳記帳 Web App**。支援多幣別匯率轉換、即時雲端同步、收據憑證上傳、PWA 背景推播通知，讓多人帳目一目了然、結算清晰透明。

---

## ✨ 功能特色

### 🏠 活動管理
- 建立多個獨立分帳活動（旅遊、聚餐、合租等）
- 活動描述、多幣別配置與結算幣別設定
- 活動狀態管理：進行中 → 開始結算 → 取消結算 → 重啟活動
- 活動刪除（建立者限定）

### 👥 成員管理
- 邀請已註冊使用者加入（以 Email 或 Email 前綴搜尋）
- 支援「臨時成員」（未連結帳號，適合幫朋友代記）
- 個人收款設定（現金 / 銀行轉帳 / LINE Pay）
- 個人大頭貼上傳與暱稱修改，跨活動自動同步

### 💰 記帳系統
- 四種分攤模式：
  - **均分**（所有成員）
  - **選人均分**（指定成員平均分攤）
  - **自訂比例**（自由輸入各人金額）
  - **逐項分攤**（選擇每個人吃了哪些品項）
- 小費計算（支援固定金額或百分比，自動分攤至各人）
- 收據/發票照片上傳（支援多張），前端自動壓縮至 1200px（保留發票文字清晰度）
- 歷史帳目搜尋與成員篩選

### 💱 多幣別支援
- 同一活動支援混合幣別記帳（USD / TWD / JPY）
- 自訂各幣別對結算幣別的匯率
- 結算時自動統一換算為指定結算幣別

### 📊 結算系統
- 自動計算最優化轉帳路徑（最小化轉帳筆數）
- 顯示「誰欠誰多少錢」與對應收款方式
- 逐筆標記「已付款」，完全結清後自動更新狀態
- CSV 匯出功能（UTF-8 BOM，Excel 直接開啟不亂碼）

### 🔔 即時通知
- Supabase Realtime 跨裝置即時同步
- 新增/編輯/刪除帳目、開始結算、取消結算、已付款確認 等事件推播
- PWA Service Worker 背景通知（手機鎖屏可接收 OS 系統橫幅）

### 🖼️ 個人大頭貼
- 上傳照片至 Supabase Storage（`avatars` Bucket）
- 前端 Canvas 自動壓縮至 **300×300px / JPEG 85%**，支援手機直拍照片（5MB+）
- 點擊任意位置的頭像圖示可放大預覽

### 📱 PWA 支援
- 可安裝至手機主畫面
- Service Worker 離線快取支援

---

## 🛠️ 技術架構

| 類別 | 技術 |
|------|------|
| 前端框架 | React 19 + TypeScript |
| 建置工具 | Vite 8 |
| 樣式 | Vanilla CSS（CSS Variables 設計系統） |
| 後端 / 資料庫 | Supabase（PostgreSQL + Realtime + Auth + Storage） |
| 圖示庫 | Lucide React |
| 圖片壓縮 | HTML5 Canvas API（純前端，無第三方依賴） |
| 部署 | GitHub Pages / 任意靜態託管 |

---

## 📁 專案結構

```
src/
├── components/
│   ├── LoginScreen.tsx      # 登入 / 註冊畫面
│   ├── EventSelector.tsx    # 活動列表主頁（含使用者卡片、邀請管理）
│   ├── EventDashboard.tsx   # 活動內部（記帳、結算、成員分頁）
│   ├── ExpenseModal.tsx     # 新增 / 編輯帳目彈窗
│   ├── ProfileModal.tsx     # 個人資料（暱稱、大頭貼）彈窗
│   └── HelpModal.tsx        # 使用說明彈窗
├── App.tsx                  # 根元件（Auth 狀態、即時訂閱、路由邏輯）
├── supabase.ts              # Supabase Client 初始化
├── types.ts                 # TypeScript 型別定義
├── utils.ts                 # 工具函數（分攤計算、匯率換算、圖片壓縮）
└── index.css                # 全域設計系統（變數、元件樣式、動畫）
```

---

## ⚙️ Supabase 設定

### 1. 建立專案

前往 [supabase.com](https://supabase.com) 建立新專案，取得：
- `Project URL`
- `anon public key`

### 2. 環境變數

在專案根目錄建立 `.env.local`：

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. 資料庫 Table

在 Supabase SQL Editor 執行以下建立 `events` 與 `profiles` table：

```sql
-- 使用者個人資料
create table profiles (
  id uuid references auth.users primary key,
  email text,
  name text,
  avatar_url text,
  payment_methods jsonb,
  updated_at timestamptz default now()
);

-- 分帳活動（含成員、帳目 JSON）
create table events (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 啟用 Realtime
alter table events replica identity full;
alter publication supabase_realtime add table events;
```

### 4. Storage Bucket

建立以下兩個 **Public** Bucket：

| Bucket 名稱 | 用途 |
|------------|------|
| `avatars` | 使用者大頭貼 |
| `receipts` | 記帳收據 / 發票照片 |

**RLS Policy（avatars）**：

```sql
-- 任何人可讀取
create policy "avatars public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- 登入使用者可上傳自己的大頭貼
create policy "avatars auth upload" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 🚀 本地開發

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev

# 型別檢查 + 打包
npm run build
```

---

## 🔐 認證流程

1. 使用者以 Email / 密碼透過 Supabase Auth 註冊 / 登入
2. 登入後自動讀取 `profiles` table 取得暱稱、大頭貼與收款設定
3. Session 由 Supabase Client 自動管理（localStorage 持久化）

---

## 📝 授權

MIT License
