# classMemo 教室便條貼

匿名、即時同步的班級便條貼白板。老師建立白板連結與 QR Code 後，學生可用手機、平板或電腦匿名新增、編輯、拖曳、縮放與刪除便條貼。

資料儲存在 Firebase Realtime Database；前端使用 Firebase Anonymous Authentication 連線，因此不再需要 Google Form 或 Google Sheet。

## 功能

- 建立可分享的白板連結與 QR Code。
- Firebase Realtime Database 即時同步。
- 匿名登入，不要求學生建立帳號。
- 便條貼新增、編輯、拖曳、縮放、變色與刪除。
- 清除整張白板的所有便條貼。
- 展示頁 `demo.html` 使用瀏覽器 localStorage，不會寫入 Firebase。

## 資料與權限

Firebase 專案為 `classmemo`，預設 Realtime Database 為 `classmemo-default-rtdb`，位置是 `asia-southeast1`。

資料庫規則要求已通過 Firebase Authentication 的使用者才能讀寫。白板採匿名協作設計：任何持有白板連結的使用者都能查看與修改該白板，因此請勿放入個資或敏感內容。

## 本機預覽

使用任一靜態網站伺服器即可，例如：

```bash
python3 -m http.server 8080
```

開啟 `http://localhost:8080/`，Firebase 已授權 `localhost` 與 `127.0.0.1`。

## Firebase 設定檔

- `js/firebase-config.js`：Firebase Web App 的公開 SDK 設定。
- `database.rules.json`：Realtime Database 安全規則。
- `.firebaserc` 和 `firebase.json`：Firebase CLI 專案與部署設定。

部署規則：

```bash
firebase deploy --only database
```

## GitHub Pages

將 `main` 分支的根目錄設定為 GitHub Pages 的部署來源即可。網站網址預計為：

`https://educatres.github.io/classmemo/`

## 授權

MIT License。
