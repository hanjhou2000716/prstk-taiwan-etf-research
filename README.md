# PRStK Taiwan ETF Research Platform

可重現、可審計的台灣 ETF 研究專案，研究標的為 TWSE 006208 與 00685L。

## 快速開始

```powershell
python -m prstk_research.pipeline run --download
```

若已有原始資料：

```powershell
python -m prstk_research.pipeline run
```

完整流程會：下載 TWSE 官方月資料、保存原始 JSON 與 SHA-256 manifest、清理及驗證價格、執行四個最小基準策略、計算績效指標，並產生 HTML Proposal/研究報告。

## 目前明確不宣稱

本專案不會虛構回測結果。若官方端點無法下載，流程會回報失敗原因，不會以示意數字填充結果。配息、分割、反分割及其他公司行動目前保留資料結構；沒有可靠事件資料時，報告會標示為未納入。

## 產物

- `data/raw/twse/`：原始 API 回應
- `data/processed/`：標準化 CSV
- `artifacts/validation/`：資料品質報告
- `artifacts/backtests/`：策略淨值序列
- `artifacts/metrics/`：指標表
- `artifacts/reports/`：HTML 報告

## 資料來源

預設使用 TWSE OpenAPI/歷史日成交資料。程式保存請求 URL、下載時間與內容雜湊，讓每次研究都能追溯資料版本。

## 模型邊界

質押模型以使用者提供的條件建模：年利率 3.3%、最高成數 60%、半年計息；維持率為擔保品市值/借款本金，追繳 130%、借新還舊 166%、退擔保 167%。這是研究假設，不是券商合約或投資建議。
