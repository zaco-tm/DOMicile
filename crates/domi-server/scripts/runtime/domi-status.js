/* DOMicile iteration status runtime — server-injected.
   Listens for `agent-iterating` events on `domi-event` and toggles a
   dismissable "Iterating…" modal + chip spinner. */
(() => {
  if (!window.__DOMI_SERVER__) return;
  if (window.__DOMI_STATUS__) return;
  window.__DOMI_STATUS__ = true;

  let inFlight = false;
  let dismissedThisRun = false;

  window.addEventListener("domi-event", (ev) => {
    const e = ev.detail;
    if (!e || e.kind !== "agent-iterating") return;
    const state = e.data && e.data.state;
    if (state === "start") {
      inFlight = true;
      dismissedThisRun = false;
      showModal();
      updateChip("iterating");
    } else if (state === "end") {
      inFlight = false;
      hideModal();
      updateChip("ready");
    }
  });

  function showModal() {
    if (dismissedThisRun) return;
    if (document.querySelector("[data-domini-iter-modal]")) return;
    injectStylesOnce();
    const backdrop = document.createElement("div");
    backdrop.setAttribute("data-domini-iter-modal", "");
    backdrop.innerHTML = `
      <div class="domini-iter-card">
        <button type="button" data-domini-iter-hide aria-label="Hide">&times;</button>
        <div class="domini-iter-spinner" aria-hidden="true"></div>
        <div class="domini-iter-label">Iterating&hellip;</div>
      </div>
    `;
    document.body.appendChild(backdrop);
    const hide = backdrop.querySelector("[data-domini-iter-hide]");
    if (hide) {
      hide.addEventListener("click", () => {
        dismissedThisRun = true;
        hideModal();
      });
    }
  }

  function hideModal() {
    const m = document.querySelector("[data-domini-iter-modal]");
    if (m) m.remove();
  }

  function updateChip(state) {
    const chip = document.querySelector("[data-domini-status-chip]");
    if (!chip) return;
    if (state === "iterating") {
      chip.setAttribute("data-iterating", "");
      if (!chip.querySelector(".domini-iter-dot")) {
        const dot = document.createElement("span");
        dot.className = "domini-iter-dot";
        dot.setAttribute("aria-hidden", "true");
        chip.appendChild(dot);
      }
    } else {
      chip.removeAttribute("data-iterating");
      const dot = chip.querySelector(".domini-iter-dot");
      if (dot) dot.remove();
    }
  }

  let stylesInjected = false;
  function injectStylesOnce() {
    if (stylesInjected) return;
    stylesInjected = true;
    const s = document.createElement("style");
    s.setAttribute("data-domini-iter-styles", "");
    s.textContent = `
      [data-domini-iter-modal] {
        position: fixed; inset: 0; z-index: 9999;
        background: linear-gradient(135deg,
          rgba(168,156,200,.35) 0%,
          rgba(244,151,142,.35) 60%,
          rgba(255,214,179,.35) 100%);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        display: grid; place-items: center;
        animation: domini-iter-fade .15s ease-out;
      }
      .domini-iter-card {
        position: relative;
        background: rgba(255,255,255,.7);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border-radius: 16px; padding: 32px 48px;
        box-shadow: 0 8px 32px rgba(61,35,66,.15);
        font-family: 'JetBrains Mono', 'SF Mono', monospace;
        color: #3d2342; display: flex; flex-direction: column;
        align-items: center; gap: 16px; min-width: 240px;
      }
      .domini-iter-card [data-domini-iter-hide] {
        position: absolute; top: 8px; right: 8px;
        background: none; border: 0; cursor: pointer;
        font-size: 20px; line-height: 1; color: #3d2342;
        opacity: .6; padding: 4px 8px; border-radius: 4px;
      }
      .domini-iter-card [data-domini-iter-hide]:hover {
        opacity: 1; background: rgba(0,0,0,.05);
      }
      .domini-iter-spinner {
        width: 32px; height: 32px;
        border: 3px solid rgba(61,35,66,.2);
        border-top-color: #c2410c;
        border-radius: 50%;
        animation: domini-iter-spin .8s linear infinite;
      }
      .domini-iter-label { font-size: 14px; letter-spacing: .02em; }
      [data-domini-status-chip][data-iterating] .domini-iter-dot {
        display: inline-block; width: 8px; height: 8px; margin-left: 6px;
        border-radius: 50%; background: #c2410c;
        animation: domini-iter-pulse 1.2s ease-in-out infinite;
      }
      @keyframes domini-iter-spin { to { transform: rotate(360deg); } }
      @keyframes domini-iter-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: .4; transform: scale(.7); }
      }
      @keyframes domini-iter-fade { from { opacity: 0; } to { opacity: 1; } }
    `;
    document.head.appendChild(s);
  }
})();