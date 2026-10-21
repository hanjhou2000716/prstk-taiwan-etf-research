import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styles.css";

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Errors are shown locally; financial data is never sent. */ }
  render() {
    if (this.state.failed) return <main className="recovery-screen" role="alert"><section><h1>畫面遇到問題</h1><p>重新載入會嘗試恢復最近一次已保存的輸入。尚未保存的最後輸入可能無法恢復。</p><button className="button primary" onClick={() => window.location.reload()}>重新載入並恢復</button></section></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><AppErrorBoundary><App /></AppErrorBoundary></React.StrictMode>);
