# classMemo 教室便條貼

匿名、即時同步的班級便條貼白板。老師建立白板連結與 QR Code 後，學生可用手機、平板或電腦匿名新增、編輯、拖曳、縮放與刪除便條貼。

資料儲存在 Firebase Realtime Database；前端使用 Firebase Anonymous Authentication 連線，因此不再需要 Google Form 或 Google Sheet。

本專案是以 Google Form／Sheet 架構的「ClassBoard 班級共創牆」為基礎所開發的改良版本。原專案在班級人數較多、學生同時送出內容時，可能因資料處理速度不足而出現同步延遲，因此本版本將後台的中繼資料庫改為 Firebase，以提升即時同步的效率與穩定性。不過，Firebase 的後台設定相對複雜，對沒有程式背景的老師而言，初次建置可能需要較多設定步驟。

## 功能

- 建立包含學生三位數密鑰的可分享連結與 QR Code；首頁白板清單的連結不會公開密鑰。
- 每張白板均有系統產生的老師專用六位數登入密鑰；持有白板連結與密鑰的裝置可取得同等老師權限。
- 每張白板均有學生三位數登入密鑰；學生可透過分享網址自動登入，或在白板頁面手動輸入密鑰。
- 老師登入後可凍結學生編輯、清除或刪除本白板，並下載或匯入 JSON 以回復便條貼內容。
- 白板自建立起保留 3 天；到期後所有寫入都會被資料庫規則拒絕，並在有人開啟首頁或白板時自動清除資料。
- Firebase Realtime Database 即時同步。
- 匿名登入，不要求學生建立帳號。
- 便條貼新增、編輯、拖曳、縮放、變色與刪除。
- 清除整張白板的所有便條貼。

## 資料與權限

Firebase 專案為 `classmemo`，預設 Realtime Database 為 `classmemo-default-rtdb`，位置是 `asia-southeast1`。學生與老師均使用 Firebase Anonymous Authentication；輸入正確六位數密鑰後，目前匿名 UID 會被授權為該白板管理員。

資料庫規則要求已通過 Firebase Authentication 的使用者才能讀寫。白板採匿名協作設計：新白板會要求學生三位數密鑰；未凍結時，持有分享網址或正確密鑰的學生可以修改便條貼。凍結、刪除、JSON 下載與 JSON 匯入則由該白板已授權的老師裝置限制，因此請勿將老師密鑰分享給學生。匯入只會回復便條貼，不會覆寫本白板的老師權限、凍結狀態或到期時間。

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
