#!/usr/bin/env node
// Minimal WebSocket probe for scripts/verify.sh.
// Usage: ws-probe.mjs --url ws://127.0.0.1:<port>/ws/events
import WebSocket from "ws";
import { argv } from "node:process";

const url = (() => {
  const i = argv.indexOf("--url");
  if (i < 0 || i + 1 >= argv.length) {
    console.error("usage: ws-probe.mjs --url <ws-url>");
    process.exit(2);
  }
  return argv[i + 1];
})();

const ws = new WebSocket(url);
const timer = setTimeout(() => {
  console.error("timeout waiting for first frame");
  process.exit(5);
}, 5000);

ws.on("open", () => {
  /* wait for server hello */
});
ws.on("message", (data) => {
  clearTimeout(timer);
  process.stdout.write(data.toString("utf8") + "\n");
  ws.close();
  process.exit(0);
});
ws.on("error", (e) => {
  clearTimeout(timer);
  console.error(e.message);
  process.exit(1);
});
