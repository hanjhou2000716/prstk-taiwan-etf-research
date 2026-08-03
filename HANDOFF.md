# Handoff

此交付物是 PRStK 台灣 ETF 研究平台的第一階段可執行骨架，標的為 006208 與 00685L。

## 已完成

- TWSE 月資料下載器、原始 JSON 保存與 SHA-256 manifest
- 標準化 CSV 與資料品質驗證
- 四個最小基準策略：006208 buy-and-hold、00685L buy-and-hold、50% 00685L + 50% 現金、00685L 200MA 切換
- 200MA 訊號延後一個交易日，避免 look-ahead bias
- 九策略規格化設定檔
- 質押利息、最高借款、維持率門檻模型
- HTML 報告、Docker、GitHub Actions CI / pipeline / Pages 設定

## 尚未完成

- 配息、分割、反分割及其他公司行動的正式事件資料整合
- VIX 資料與策略 3 實證回測
- 九策略動態質押逐日現金流、追繳與強制處分模擬
- 交易成本、稅費與滑價的完整換手套用
- 確認 00685L 是否符合實際券商擔保品資格

## 執行

```powershell
python -m prstk_research.pipeline run --download
```

目前不能宣稱任何不存在於 `artifacts/metrics/` 的績效數字。若下載失敗，請先修復網路或憑證環境，再重新執行；不要以手工數字填補。
