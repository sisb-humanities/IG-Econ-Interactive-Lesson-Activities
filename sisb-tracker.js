/* =====================================================================
   SISB IGCSE ECONOMICS — ACTIVITY COMPLETION TRACKER
   =====================================================================
   Include this ONE file on every interactive activity page:
       <script src="sisb-tracker.js"></script>
   (put the tag anywhere before you call SISB_TRACKER.log — easiest is
   right before your page's own closing </body> tag, above your page's
   own <script> block.)

   WHAT IT DOES
   - On first visit, asks the student for their full name once, then
     remembers it (localStorage) across every activity page on this
     GitHub Pages site — they are never asked again on this device.
   - Exposes SISB_TRACKER.log(unit, activityLabel, detail) which you
     call from inside each activity's own "all done" logic. It POSTs
     {name, unit, activity, detail, page, time} to your Google Sheet
     via a Google Apps Script Web App.
   - Shows a small green confirmation toast so the student knows their
     progress was recorded, plus a name badge bottom-right they can
     click to correct a typo.
   - Fails silently on network problems — a wifi hiccup never blocks
     or interrupts the student's activity.

   SETUP — do this once (see the setup guide provided alongside this
   file for full click-by-click steps):
     1. Create a Google Sheet, deploy the paired Apps Script as a Web
        App ("Execute as: Me", "Who has access: Anyone").
     2. Paste the Web App URL into ENDPOINT below.
     3. Upload this file once to your GitHub Pages repo root. Every
        activity page just links to it — you never edit the activity
        pages again when the endpoint changes.
   ===================================================================== */
(function () {
  "use strict";

  // ====================== CONFIG — EDIT THIS LINE ======================
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbzhQffO6XMjjKja8QMU23XeZSyt-oLj6arVX0ASRXKqS0HWRmq9jP43e_sppSlgKL1WgA/exec";
  // =======================================================================

  const NAME_KEY = "sisb_econ_student_name";
  const loggedThisSession = new Set();

  function getName() {
    return (localStorage.getItem(NAME_KEY) || "").trim();
  }
  function setName(n) {
    localStorage.setItem(NAME_KEY, n.trim());
  }

  function injectStyles() {
    if (document.getElementById("sisbtrk-styles")) return;
    const css = `
    .sisbtrk-overlay{position:fixed;inset:0;background:rgba(0,47,108,.55);display:flex;
      align-items:center;justify-content:center;z-index:9999;font-family:'Lato',sans-serif;padding:16px}
    .sisbtrk-card{background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.3);
      padding:28px 26px;max-width:360px;width:100%;text-align:center}
    .sisbtrk-card h2{color:#002F6C;font-size:18px;margin:0 0 8px;font-weight:900}
    .sisbtrk-card p{color:#456080;font-size:13.5px;line-height:1.5;margin:0 0 16px}
    .sisbtrk-card input{width:100%;padding:10px 12px;border:1.5px solid #C8D8E8;border-radius:8px;
      font-size:14px;font-family:'Lato',sans-serif;margin-bottom:6px;outline:none;box-sizing:border-box}
    .sisbtrk-card input:focus{border-color:#008BCC}
    .sisbtrk-card button{width:100%;padding:11px;border:none;border-radius:24px;background:#FF8F1C;
      color:#fff;font-weight:700;font-size:14px;font-family:'Lato',sans-serif;cursor:pointer;margin-top:10px}
    .sisbtrk-card button:hover{background:#e67d09}
    .sisbtrk-err{color:#D63864;font-size:12px;margin:4px 0 0;display:none;text-align:left}
    .sisbtrk-badge{position:fixed;bottom:14px;right:14px;background:#002F6C;color:#fff;font-size:11.5px;
      font-weight:700;padding:7px 13px;border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,.25);
      z-index:500;cursor:pointer;font-family:'Lato',sans-serif}
    .sisbtrk-badge:hover{background:#003d8a}
    .sisbtrk-toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);
      background:#28A745;color:#fff;font-size:13px;font-weight:700;padding:10px 18px;border-radius:24px;
      box-shadow:0 4px 16px rgba(0,0,0,.25);z-index:9998;opacity:0;transition:opacity .25s,transform .25s;
      pointer-events:none;font-family:'Lato',sans-serif;white-space:nowrap}
    .sisbtrk-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
    `;
    const style = document.createElement("style");
    style.id = "sisbtrk-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function showBadge() {
    let badge = document.querySelector(".sisbtrk-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "sisbtrk-badge";
      badge.title = "Click to correct your name";
      badge.addEventListener("click", function () {
        showNameModal(showBadge, true);
      });
      document.body.appendChild(badge);
    }
    badge.textContent = "\uD83D\uDC64 " + getName();
  }

  function showToast(msg) {
    let t = document.querySelector(".sisbtrk-toast");
    if (!t) {
      t = document.createElement("div");
      t.className = "sisbtrk-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(function () {
      t.classList.add("show");
    });
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function () {
      t.classList.remove("show");
    }, 2600);
  }

  function showNameModal(onDone, isChange) {
    injectStyles();
    const overlay = document.createElement("div");
    overlay.className = "sisbtrk-overlay";
    overlay.innerHTML =
      '<div class="sisbtrk-card">' +
      "<h2>" + (isChange ? "Correct your name" : "Before you start\u2026") + "</h2>" +
      "<p>Enter your <b>full name</b> exactly as it appears in Google Classroom, so your teacher can match your progress to you.</p>" +
      '<input type="text" id="sisbtrk-input" placeholder="e.g. Somchai Rattanakosin" autocomplete="name">' +
      '<div class="sisbtrk-err" id="sisbtrk-err">Please enter your first and last name.</div>' +
      '<button id="sisbtrk-go">' + (isChange ? "Save" : "Start activity") + "</button>" +
      "</div>";
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#sisbtrk-input");
    const err = overlay.querySelector("#sisbtrk-err");
    input.value = isChange ? getName() : "";
    input.focus();
    function submit() {
      const val = input.value.trim();
      if (val.length < 3 || val.indexOf(" ") === -1) {
        err.style.display = "block";
        return;
      }
      setName(val);
      overlay.remove();
      if (onDone) onDone();
    }
    overlay.querySelector("#sisbtrk-go").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") submit();
    });
  }

  function ensureName(callback) {
    const name = getName();
    if (name) {
      callback(name);
      return;
    }
    showNameModal(function () {
      callback(getName());
    });
  }

  function log(unit, activity, detail) {
    const key = unit + "::" + activity;
    if (loggedThisSession.has(key)) return; // one row per activity per visit
    ensureName(function (name) {
      loggedThisSession.add(key);
      const payload = {
        name: name,
        unit: unit,
        activity: activity,
        detail: detail || "",
        page: location.pathname,
      };
      if (ENDPOINT.indexOf("PASTE_YOUR") === -1) {
        fetch(ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload),
        }).catch(function () {
          /* fail silently — a network hiccup never blocks the student */
        });
      }
      showToast("\u2713 Progress recorded for " + name.split(" ")[0]);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    injectStyles();
    if (getName()) showBadge();
  });

  window.SISB_TRACKER = { log: log, getName: getName, ensureName: ensureName };
})();
