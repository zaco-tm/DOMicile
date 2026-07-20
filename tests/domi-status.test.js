// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

function loadStatus() {
  delete window.__DOMI_STATUS__;
  document.querySelectorAll("[data-domini-iter-modal]").forEach((n) => n.remove());
  document.querySelectorAll("[data-domini-iter-styles]").forEach((n) => n.remove());
  const chip = document.querySelector("[data-domini-status-chip]");
  if (chip) {
    chip.removeAttribute("data-iterating");
    chip.querySelectorAll(".domini-iter-dot").forEach((n) => n.remove());
  }
  const file = path.resolve("scripts/runtime/domi-status.js");
  const code = fs.readFileSync(file, "utf8");
  // eslint-disable-next-line no-eval
  (0, eval)(code);
}

describe("domi-status", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <span data-domini-status-chip>v1</span>
    `;
    window.__DOMI_SERVER__ = true;
  });

  test("no-op when not in server mode", () => {
    window.__DOMI_SERVER__ = false;
    loadStatus();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" },
    }));
    expect(document.querySelector("[data-domini-iter-modal]")).toBeNull();
  });

  test("creates modal on agent-iterating start", () => {
    loadStatus();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" },
    }));
    const modal = document.querySelector("[data-domini-iter-modal]");
    expect(modal).not.toBeNull();
    expect(modal.querySelector(".domini-iter-label")?.textContent).toContain("Iterating");
    const chip = document.querySelector("[data-domini-status-chip]");
    expect(chip?.hasAttribute("data-iterating")).toBe(true);
  });

  test("removes modal on agent-iterating end", () => {
    loadStatus();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" },
    }));
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "end", source: "watcher" }, doc: "test" },
    }));
    expect(document.querySelector("[data-domini-iter-modal]")).toBeNull();
    const chip = document.querySelector("[data-domini-status-chip]");
    expect(chip?.hasAttribute("data-iterating")).toBe(false);
  });

  test("ignores events for other kinds", () => {
    loadStatus();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "rail-add", data: { body: "x", targetId: null }, doc: "test" },
    }));
    expect(document.querySelector("[data-domini-iter-modal]")).toBeNull();
  });

  test("dismiss button hides modal but chip continues", () => {
    loadStatus();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" },
    }));
    const hide = document.querySelector("[data-domini-iter-hide]");
    expect(hide).not.toBeNull();
    hide?.click();
    expect(document.querySelector("[data-domini-iter-modal]")).toBeNull();
    const chip = document.querySelector("[data-domini-status-chip]");
    expect(chip?.hasAttribute("data-iterating")).toBe(true);
  });

  test("dismiss resets on next start", () => {
    loadStatus();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" },
    }));
    document.querySelector("[data-domini-iter-hide]")?.click();
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "end", source: "watcher" }, doc: "test" },
    }));
    window.dispatchEvent(new CustomEvent("domi-event", {
      detail: { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" },
    }));
    expect(document.querySelector("[data-domini-iter-modal]")).not.toBeNull();
  });

  test("subsequent start events are idempotent", () => {
    loadStatus();
    const ev = { kind: "agent-iterating", data: { state: "start", source: "watcher" }, doc: "test" };
    window.dispatchEvent(new CustomEvent("domi-event", { detail: ev }));
    window.dispatchEvent(new CustomEvent("domi-event", { detail: ev }));
    expect(document.querySelectorAll("[data-domini-iter-modal]").length).toBe(1);
  });
});