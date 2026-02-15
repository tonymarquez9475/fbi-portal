const boot = document.getElementById("boot");
const portal = document.getElementById("portal");
const bootLog = document.getElementById("bootLog");

const transcriptEl = document.getElementById("transcript");
const msgEl = document.getElementById("msg");
const sendBtn = document.getElementById("send");
const syslogBody = document.getElementById("syslogBody");
const contactsEl = document.getElementById("contacts");
const activeCharEl = document.getElementById("activeChar");
const signalEl = document.getElementById("signal");
const notificationEl = document.getElementById("notification");

const fileChargesBtn = document.getElementById("fileCharges");
const resetCaseBtn = document.getElementById("resetCase");

const modal = document.getElementById("modal");
const modalText = document.getElementById("modalText");
const closeModal = document.getElementById("closeModal");

const convictionEl = document.getElementById("conviction");
const rankEl = document.getElementById("rank");

const caseBody = document.getElementById("caseBody");
const tabs = [...document.querySelectorAll(".tab")];

const CASE = {
  summary:
`CASE ID: 01-104A
TITLE: Billing Irregularities – North Sector Medical
FLAG: POSSIBLE BILLING FRAUD

Multiple patients reported charges for services they claim were never received.
Facility records appear internally consistent, but witness accounts conflict.

OBJECTIVE:
Interview contacts. Identify inconsistencies. File charges.`,
  report:
`INCIDENT REPORT (ABRIDGED)
- Patient complaints reference "Observation Services" and misc line items.
- Staff notes indicate standard intake procedures.
- Billing records show consistent coding; no manual overrides are documented.
- Several complaints occurred within the same 30-day window.`,
  evidence:
`EVIDENCE NOTES
(Prototype: add notes yourself here via the prompt on File Charges, or extend later with unlockable evidence.)`,
  charges:
`CHARGE OPTIONS
- Fraudulent Billing
- False Reporting
- Administrative Negligence

Tip: If you submit charges too early, prosecutor will reject or request more.`
};

const CONTACTS = [
  { key: "patient", name: "PATIENT WITNESS", status: "AVAILABLE" },
  { key: "reception", name: "RECEPTION SUPERVISOR", status: "AVAILABLE" },
  { key: "billing", name: "BILLING COORDINATOR", status: "AVAILABLE" }
];

// Soft pressure: each time you SELECT a contact, they move toward unavailability
const contactSessions = { patient: 0, reception: 0, billing: 0 };

let active = null;
let transcript = [];
let stats = loadStats();

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logSystem(line) {
  syslogBody.innerHTML += `[${nowStamp()}] ${escapeHtml(line)}<br/>`;
  syslogBody.scrollTop = syslogBody.scrollHeight;
}

function setNotification(title, body) {
  notificationEl.innerHTML = `<strong>${escapeHtml(title)}</strong><br/>${escapeHtml(body)}`;
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderContacts() {
  contactsEl.innerHTML = "";
  CONTACTS.forEach(c => {
    const statusClass =
      c.status === "AVAILABLE" ? "av" :
      c.status === "BUSY" ? "busy" : "unav";

    const row = document.createElement("div");
    row.className = "contactRow";
    row.innerHTML = `<span>${c.name}</span><span class="badge ${statusClass}">${c.status}</span>`;
    row.onclick = () => {
      if (c.status === "UNAVAILABLE") {
        logSystem(`CONTACT ${c.name} UNAVAILABLE.`);
        setNotification("CONTACT UNAVAILABLE", `${c.name} is not accepting further calls.`);
        return;
      }
      active = c.key;
      activeCharEl.textContent = c.name;
      signalEl.textContent = "STABLE";
      logSystem(`CALL SESSION READY: ${c.name}`);
      addLine("SYSTEM", `CONNECTED: ${c.name}. (Phone line audio)`);

      // Soft pressure
      contactSessions[active] += 1;
      if (contactSessions[active] >= 4) {
        c.status = "UNAVAILABLE";
        logSystem(`SOFT PRESSURE: ${c.name} set to UNAVAILABLE.`);
        setNotification("SOFT PRESSURE", `${c.name} stops responding after repeated contacts.`);
        renderContacts();
      } else {
        setNotification("CALL READY", `Interrogating ${c.name}. Keep it tight—contacts can stop cooperating.`);
      }
    };
    contactsEl.appendChild(row);
  });
}

function addLine(sender, text) {
  transcript.push({ sender, text });
  renderTranscript();
}

function renderTranscript() {
  transcriptEl.innerHTML = "";
  transcript.forEach(m => {
    const div = document.createElement("div");
    div.className = "line";
    if (m.sender === "YOU") div.classList.add("you");
    else if (m.sender === "SYSTEM") div.classList.add("sys");
    else div.classList.add("ai");
    div.textContent = `${m.sender}: ${m.text}`;
    transcriptEl.appendChild(div);
  });
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
}

function transcriptText() {
  return transcript.map(m => `${m.sender}: ${m.text}`).join("\n");
}

function updateHUD() {
  rankEl.textContent = rankName(stats.rankIndex);
  convictionEl.textContent = stats.totalDecisions === 0 ? "--" : `${Math.round(stats.convictionRate * 100)}% (${stats.accepted}/${stats.totalDecisions})`;
}

function rankName(i) {
  const ranks = [
    "PROBATIONARY AGENT",
    "FIELD INVESTIGATOR",
    "SENIOR AGENT",
    "CASE SPECIALIST",
    "LEAD INVESTIGATOR"
  ];
  return ranks[Math.max(0, Math.min(i, ranks.length - 1))];
}

function maybePromote() {
  // Promotion rules (simple prototype):
  // - need at least 3 decisions total
  // - conviction rate >= threshold by rank
  const thresholds = [0.55, 0.62, 0.70, 0.78];
  if (stats.rankIndex >= thresholds.length) return;

  if (stats.totalDecisions >= 3 && stats.convictionRate >= thresholds[stats.rankIndex]) {
    stats.rankIndex += 1;
    saveStats(stats);
    updateHUD();
    logSystem(`PROMOTION: Access level increased to ${rankName(stats.rankIndex)}.`);
    setNotification("ACCESS LEVEL UPDATED", `Promotion granted: ${rankName(stats.rankIndex)}.`);
  }
}

async function sendMessage() {
  const txt = msgEl.value.trim();
  if (!txt) return;

  if (!active) {
    logSystem("No active contact selected.");
    addLine("SYSTEM", "SELECT A CONTACT BEFORE SENDING.");
    msgEl.value = "";
    return;
  }

  addLine("YOU", txt);
  msgEl.value = "";

  logSystem(`SENT TO ${active.toUpperCase()}: "${txt}"`);
  signalEl.textContent = "PROCESSING…";

  const res = await fetch("/api/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      roleKey: active,
      transcriptText: transcriptText(),
      playerMessage: txt
    })
  });

  const data = await res.json();
  signalEl.textContent = "STABLE";

  if (!res.ok) {
    addLine("SYSTEM", `ERROR: ${data.error || "Request failed"}`);
    logSystem("API ERROR.");
    setNotification("ERROR", data.error || "Request failed");
    return;
  }

  addLine(active.toUpperCase(), data.text || "(no response)");
}

sendBtn.addEventListener("click", sendMessage);
msgEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

fileChargesBtn.addEventListener("click", async () => {
  if (transcript.length === 0) {
    addLine("SYSTEM", "NO TRANSCRIPT. INVESTIGATE BEFORE FILING.");
    setNotification("NO TRANSCRIPT", "Investigate before filing charges.");
    return;
  }

  const target = prompt("Charge target? (PATIENT / RECEPTION / BILLING)", "RECEPTION");
  if (!target) return;

  const type = prompt("Charge type? (Fraudulent Billing / False Reporting / Administrative Negligence)", "Administrative Negligence");
  if (!type) return;

  const evidenceNotes = prompt("Evidence notes (optional, helps prosecutor):", "Example: Witness claims charges were automatic; billing mentions threshold rule.");
  logSystem(`CHARGES SUBMITTED: ${target} — ${type}`);

  signalEl.textContent = "SUBMITTING…";

  const res = await fetch("/api/prosecute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transcriptText: transcriptText(),
      chargeTarget: target,
      chargeType: type,
      evidenceNotes: evidenceNotes || ""
    })
  });

  const data = await res.json();
  signalEl.textContent = "STABLE";

  if (!res.ok) {
    addLine("SYSTEM", `PROSECUTOR ERROR: ${data.error || "Request failed"}`);
    setNotification("PROSECUTOR ERROR", data.error || "Request failed");
    return;
  }

  const text = (data.text || "").trim();
  modalText.textContent = text || "(no response)";
  modal.classList.add("active");
  modal.setAttribute("aria-hidden", "false");

  // Update conviction stats based on decision keyword
  const decision = parseDecision(text);
  if (decision === "ACCEPT") stats.accepted += 1;
  if (decision === "REJECT") stats.rejected += 1;
  if (decision === "NEED MORE") stats.needMore += 1;

  stats.totalDecisions = stats.accepted + stats.rejected; // conviction uses accept/reject only
  const denom = Math.max(1, stats.totalDecisions);
  stats.convictionRate = stats.accepted / denom;

  saveStats(stats);
  updateHUD();
  maybePromote();

  setNotification("PROSECUTOR REVIEW COMPLETE", `Decision: ${decision || "UNKNOWN"}. Your record has been updated.`);
});

function parseDecision(text) {
  const m = text.match(/DECISION:\s*(ACCEPT|REJECT|NEED MORE)/i);
  return m ? m[1].toUpperCase() : "";
}

closeModal.addEventListener("click", () => {
  modal.classList.remove("active");
  modal.setAttribute("aria-hidden", "true");
});

resetCaseBtn.addEventListener("click", () => {
  transcript = [];
  active = null;
  activeCharEl.textContent = "NONE";
  signalEl.textContent = "IDLE";
  CONTACTS.forEach(c => c.status = "AVAILABLE");
  contactSessions.patient = contactSessions.reception = contactSessions.billing = 0;
  renderContacts();
  renderTranscript();
  logSystem("CASE RESET.");
  setNotification("CASE RESET", "Case state cleared. Contacts restored.");
});

// Tabs
tabs.forEach(t => {
  t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    const key = t.dataset.tab;
    caseBody.textContent = CASE[key] || "";
  });
});

// Boot
const bootLines = [
  "INITIALIZING FEDERAL INVESTIGATION TERMINAL…",
  "SECURE NETWORK HANDSHAKE…",
  "AUTHORIZATION CHANNEL VERIFIED…",
  "LOADING AGENT INTERFACE MODULES…",
  "MOUNTING CASE DATABASE…",
  "ACCESS GRANTED."
];

async function runBoot() {
  for (const line of bootLines) {
    bootLog.textContent += line + "\n";
    await new Promise(r => setTimeout(r, 450));
  }
  await new Promise(r => setTimeout(r, 350));

  boot.classList.remove("active");
  portal.classList.add("active");

  logSystem("PORTAL READY.");
  setNotification("NEW PRIORITY MESSAGE", "Case assigned. Open case file. Select a contact to initiate secure call.");
}

function loadStats() {
  try {
    const raw = localStorage.getItem("fbi_portal_stats_v1");
    if (!raw) throw new Error("none");
    const s = JSON.parse(raw);
    return {
      rankIndex: Number.isFinite(s.rankIndex) ? s.rankIndex : 0,
      accepted: Number.isFinite(s.accepted) ? s.accepted : 0,
      rejected: Number.isFinite(s.rejected) ? s.rejected : 0,
      needMore: Number.isFinite(s.needMore) ? s.needMore : 0,
      totalDecisions: Number.isFinite(s.totalDecisions) ? s.totalDecisions : 0,
      convictionRate: Number.isFinite(s.convictionRate) ? s.convictionRate : 0
    };
  } catch {
    return { rankIndex: 0, accepted: 0, rejected: 0, needMore: 0, totalDecisions: 0, convictionRate: 0 };
  }
}

function saveStats(s) {
  localStorage.setItem("fbi_portal_stats_v1", JSON.stringify(s));
}

function init() {
  caseBody.textContent = CASE.summary;
  renderContacts();
  renderTranscript();
  updateHUD();
  runBoot();
}

init();
