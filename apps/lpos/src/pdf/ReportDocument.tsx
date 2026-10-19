import React from "react";
import { Document, Page, Text, View, Link, StyleSheet, Svg, Line, Polyline } from "@react-pdf/renderer";
import type { ResearchReportV1, ReportBlock } from "../types.js";
const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 45, paddingHorizontal: 42, fontFamily: "LPOS Noto TC", fontSize: 9, color: "#182d43", lineHeight: 1.5, backgroundColor: "#ffffff" },
  header: { borderBottomWidth: 1, borderBottomColor: "#dce5ed", paddingBottom: 9, marginBottom: 18, flexDirection: "row", justifyContent: "space-between" },
  brand: { fontSize: 8, color: "#1b7968", fontWeight: 700 },
  title: { fontSize: 20, lineHeight: 1.4, color: "#152b44", fontWeight: 700, marginBottom: 10 },
  subtitle: { fontSize: 9, lineHeight: 1.5, color: "#607287", marginBottom: 15 },
  caveat: { marginBottom: 12, color: "#854344", fontWeight: 700 },
  section: { marginTop: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 13, color: "#173b58", fontWeight: 700, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: "#dbe4ed", paddingBottom: 4 },
  body: { marginBottom: 3, color: "#3d5267" },
  table: { marginTop: 7, marginBottom: 7, borderWidth: 1, borderColor: "#dbe4ed" },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#e5ebf0", minHeight: 22, alignItems: "center" },
  cell: { paddingVertical: 4, paddingHorizontal: 5, flexGrow: 0, flexBasis: "auto", fontSize: 7.6 },
  head: { backgroundColor: "#edf3f7", color: "#173b58", fontWeight: 700 },
  footer: { position: "absolute", bottom: 18, left: 42, right: 42, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#dce5ed", paddingTop: 6, color: "#718197", fontSize: 7 },
  small: { fontSize: 7, color: "#718197" },
  link: { color: "#2a6db0", textDecoration: "underline", marginBottom: 3 },
  chart: { marginTop: 8, marginBottom: 10, padding: 7, borderWidth: 1, borderColor: "#dce5ed" }
});
function DataTable({ table }: { table: NonNullable<ReportBlock["table"]> }) {
  const count = table.headers.length;
  const widths = count === 3 && table.headers[0] === "驗證層" ? [20, 18, 62]
    : count === 3 && table.headers[0] === "日期" ? [35, 40, 25]
      : count === 2 && table.headers[1] === "SHA-256" ? [28, 72]
        : Array.from({ length: count }, () => 100 / count);
  return <View style={styles.table}>
    <View style={[styles.row, styles.head]} fixed>{table.headers.map((cell, i) => <Text key={"h" + i} style={[styles.cell, { width: widths[i] + "%" }]}>{cell}</Text>)}</View>
    {table.rows.map((row, r) => <View key={"r" + r} style={styles.row} wrap={false}>{row.map((cell, i) => <Text key={"c" + i} style={[styles.cell, { width: widths[i] + "%" }]}>{cell}</Text>)}</View>)}
  </View>;
}
function VectorChart({ chart }: { chart: ResearchReportV1["charts"][number] }) {
  const low = Math.min(...chart.points), high = Math.max(...chart.points), span = Math.max(0.0001, high - low);
  const points = chart.points.map((value, index) => (12 + index * 516 / Math.max(1, chart.points.length - 1)) + "," + (96 - (value - low) / span * 76)).join(" ");
  return <View style={styles.chart} wrap={false}>
    <Text style={styles.sectionTitle}>{chart.title}</Text>
    <Svg width="100%" height="108" viewBox="0 0 540 108">
      <Line x1="12" y1="97" x2="528" y2="97" stroke="#b8c7d3" strokeWidth="1" />
      <Polyline points={points} fill="none" stroke="#18836e" strokeWidth="2" />
    </Svg>
    <Text style={styles.small}>{chart.start} 至 {chart.end}｜指數 {low.toFixed(2)} – {high.toFixed(2)}</Text>
  </View>;
}
export function ReportDocument({ report }: { report: ResearchReportV1 }) {
  return <Document title={report.title + " - " + report.scenarioName} author="LPOS Portfolio Lab" subject="可重現的量化投資研究">
    <Page size="A4" style={styles.page} wrap>
      <View style={styles.header} fixed><Text style={styles.brand}>LPOS PORTFOLIO LAB｜研究工作台 V0.7</Text><Text style={styles.small}>{report.status === "complete" ? "研究結果" : "診斷報告 · " + report.status}</Text></View>
      <Text style={styles.title}>{report.title}</Text>
      <Text style={styles.subtitle}>{report.subtitle}</Text>
      <Text style={styles.caveat}>{report.caveat}</Text>
      <Text style={styles.body}>報告編號：{report.reportId}｜研究編號：{report.runId}</Text>
      <Text style={styles.body}>產生時間：{report.generatedAt}</Text>
      <Text style={styles.body}>參數指紋：{report.parameterFingerprint}</Text>
      <Text style={styles.body}>資料指紋：{report.dataFingerprint}</Text>
      {report.charts.map(chart => <VectorChart key={chart.id} chart={chart} />)}
      {report.blocks.map((block, index) => <View key={block.id} style={styles.section} break={index > 0 && index === 4}>
        <Text style={styles.sectionTitle}>{block.title}</Text>
        {block.narrative.map((line, i) => <Text key={i} style={styles.body}>{line}</Text>)}
        {block.table && <DataTable table={block.table} />}
        {block.tables?.map((table, i) => <DataTable key={i} table={table} />)}
        {block.links?.map(link => <Link key={link.url} src={link.url} style={styles.link}>{link.label}</Link>)}
      </View>)}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>研究來源</Text>
        <Link src="https://hanjhou2000716.github.io/prstk-taiwan-etf-research/data/reconciliation_report.json" style={styles.link}>公開資料稽核報告</Link>
        <Text style={styles.small}>本文件的日期、資料指紋及計算數值皆來自同一份研究結果。</Text>
      </View>
      <View style={styles.footer} fixed><Text>{report.caveat}</Text><Text render={({ pageNumber, totalPages }) => pageNumber + " / " + totalPages} /></View>
    </Page>
  </Document>;
}
