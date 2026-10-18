const login = document.querySelector("#login");
const app = document.querySelector("#app");
const main = document.querySelector("#main");
const sidenav = document.querySelector("#sidenav");
const builder = document.querySelector("#builder");
const scrim = document.querySelector("#scrim");
const toast = document.querySelector("#toast");

let catalog = null;
let state = null;
let projectTab = "plant";
let bomFilter = "All";
let saveTimer = 0;
let query = "";

const inr = new Intl.NumberFormat("en-IN");
const page = () => (window.location.pathname.replace(/\/+$/, "") === "/flow" ? "flow" : "console");

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sectionMeta(id) {
  const builtIn = catalog.sections.find((section) => section.id === id);
  if (builtIn) return builtIn;
  const custom = state.custom.find((section) => section.id === id);
  if (!custom) return null;
  return { id: custom.id, nav: custom.title, title: custom.title, custom: true };
}

function visibleSections() {
  return state.order
    .map(sectionMeta)
    .filter((section) => section && !state.hidden.includes(section.id));
}

function progress() {
  const criteria = catalog.projects.flatMap((project) => project.criteria);
  const steps = catalog.projects.flatMap((project) =>
    project.steps.map((_, index) => `${project.id}-step-${index}`)
  );
  const phase = catalog.phase2.map((_, index) => `phase2-${index}`);
  const ids = [...criteria.map((item) => item.id), ...steps, ...phase];
  const doneChecks = ids.filter((id) => state.checks[id]).length;
  const daysDone = catalog.schedule.filter((day) => state.dayStatus[day.id] === "done").length;
  const testsPassed = catalog.tests.filter((test) => state.testResult[test.id] === "pass").length;
  const received = catalog.bom.filter((item) => state.bom[item.id]?.received).length;
  const total = ids.length + catalog.schedule.length + catalog.tests.length + catalog.bom.length;
  const complete = doneChecks + daysDone + testsPassed + received;
  return {
    pct: total ? Math.round((complete / total) * 100) : 0,
    daysDone,
    testsPassed,
    received,
    criteriaDone: criteria.filter((item) => state.checks[item.id]).length,
    criteriaTotal: criteria.length,
  };
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.setTimeout(() => toast.classList.add("hidden"), 2200);
}

function remember(text) {
  state.log.unshift({ at: new Date().toISOString(), text });
  state.log = state.log.slice(0, 40);
}

function queueSave() {
  document.querySelector("#save-state").textContent = "Saving…";
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 350);
}

async function save() {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
  if (response.status === 401) {
    showLogin();
    return;
  }
  const y = window.scrollY;
  state = await response.json();
  document.querySelector("#save-state").textContent = "Saved on the server";
  render();
  window.scrollTo(0, y);
}

function pill(text) {
  const lower = text.toLowerCase();
  let kind = "neutral";
  if (lower.includes("below") || lower.includes("in range") || lower === "phase 2") kind = "ok";
  if (lower.includes("over") || lower.includes("out of stock") || lower.includes("if needed") || lower.includes("optional")) kind = "warn";
  if (lower.includes("high")) kind = "bad";
  return `<span class="pill ${kind}">${esc(text)}</span>`;
}

function statusSelect(id) {
  const current = state.dayStatus[id] || "not_started";
  const options = [
    ["not_started", "Not started"],
    ["in_progress", "In progress"],
    ["blocked", "Blocked"],
    ["done", "Done"],
  ];
  return `<select class="status" data-day="${id}">${options
    .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`)
    .join("")}</select>`;
}

function resultSelect(id) {
  const current = state.testResult[id] || "";
  return `<select class="status" data-test="${id}">
    <option value="" ${current === "" ? "selected" : ""}>Open</option>
    <option value="pass" ${current === "pass" ? "selected" : ""}>Pass</option>
    <option value="fail" ${current === "fail" ? "selected" : ""}>Fail</option>
  </select>`;
}

function check(id, text) {
  return `<label class="check"><input type="checkbox" data-check="${id}" ${state.checks[id] ? "checked" : ""}><span>${esc(text)}</span></label>`;
}

function renderPurposeBlock(block, headingIcon, cardIcons) {
  if (!block) return "";
  const cards = (block.points || [])
    .map(
      (item, index) => `<article class="purpose-card reveal" style="--i:${index}">
        <div class="section-title">${iconBadge(cardIcons[index] || "overview")}<h3>${esc(item.title)}</h3></div>
        <p>${esc(item.text)}</p>
      </article>`
    )
    .join("");
  return `
    <h3 class="purpose-subhead">${iconBadge(headingIcon, "ui-icon-inline")}${esc(block.title)}</h3>
    ${block.lead ? `<p class="purpose-lead">${esc(block.lead)}</p>` : ""}
    <div class="purpose-grid">${cards}</div>`;
}

function renderPurpose() {
  const purpose = catalog.purpose;
  if (!purpose) return "";
  const photos = (purpose.images || [])
    .map(
      (item, index) => `<figure class="purpose-photo reveal" style="--i:${index}">
        <img src="${esc(item.src)}" alt="${esc(item.caption)}" loading="lazy" width="320" height="240">
        <figcaption>${esc(item.caption)}</figcaption>
      </figure>`
    )
    .join("");
  const outcomes = (purpose.outcomes || []).map((item) => `<li>${esc(item)}</li>`).join("");
  return `<section class="section card reveal purpose-panel" id="section-purpose">
    ${sectionHead(purpose.title || "Purpose", "purpose", `<span class="pill ok">v1 intent</span>`)}
    <div class="section-body">
      ${photos ? `<div class="purpose-gallery">${photos}</div>` : ""}
      ${renderPurposeBlock(purpose.problem, "risks", ["plant", "room", "events"])}
      ${renderPurposeBlock(purpose.solution, "check", ["plant", "room", "events"])}
      ${renderPurposeBlock(purpose.how, "esp32", ["sensors", "api", "ai"])}
      ${
        outcomes
          ? `<h3 class="purpose-subhead">${iconBadge("milestones", "ui-icon-inline")} Concrete v1 outcomes</h3>
      <ul class="purpose-outcomes">${outcomes}</ul>`
          : ""
      }
    </div>
  </section>`;
}

function renderOverview() {
  const stats = progress();
  const kpiIcons = ["money", "parts", "esp32", "budget"];
  const appIcons = { plant: "plant", room: "room", events: "events" };
  const apps = catalog.apps
    .map(
      (item, index) => `<article class="card app-card reveal" style="--i:${index}">
        <div class="card-head">
          <div class="section-title">${iconBadge(appIcons[item.id] || "sensors")}<h3>${esc(item.name)}</h3></div>
          ${pill(item.role)}
        </div>
        <div class="section-body">
          <p class="muted sensor-line">${iconBadge("sensors", "ui-icon-inline")}${esc(item.sensors)}</p>
          <p class="ai-line">${iconBadge("ai", "ui-icon-inline")}${esc(item.ai)}</p>
        </div>
      </article>`
    )
    .join("");
  const kpis = catalog.kpis
    .map(
      (item, index) => `<article class="kpi reveal" style="--i:${index}">
        ${iconBadge(kpiIcons[index] || "overview")}
        <span>${esc(item.label)}</span>
        <strong>${esc(item.value)}</strong>
        <span>${esc(item.hint)}</span>
      </article>`
    )
    .join("");
  return `<section class="section" id="section-overview">
    <div class="kpi-grid">${kpis}</div>
    <div class="card snapshot-card reveal" style="--i:0">
      ${sectionHead("Build snapshot", "overview", `<span class="pill ok">${stats.pct}% tracked</span>`)}
      <div class="section-body snapshot-body">
        <div class="snapshot-copy">
          <p>${esc(catalog.project.platform)}. Prepared for ${esc(catalog.project.owner)} on ${esc(catalog.project.date)}. Difficulty ${esc(catalog.project.difficulty)}, window ${esc(catalog.project.window)}, hardware target ${esc(catalog.project.budgetTarget)}.</p>
          <div class="chips">
            <span class="chip">${iconBadge("days", "ui-icon-inline")}${stats.daysDone}/10 days done</span>
            <span class="chip">${iconBadge("check", "ui-icon-inline")}${stats.criteriaDone}/${stats.criteriaTotal} acceptance</span>
            <span class="chip">${iconBadge("tests", "ui-icon-inline")}${stats.testsPassed}/${catalog.tests.length} tests</span>
            <span class="chip">${iconBadge("bom", "ui-icon-inline")}${stats.received}/${catalog.bom.length} parts</span>
          </div>
        </div>
        <div class="snapshot-ring" title="${stats.pct}% of tracked work">${progressRing(stats.pct)}</div>
      </div>
    </div>
    <div class="card-grid three app-grid">${apps}</div>
  </section>`;
}

function renderMilestones() {
  const doneDays = new Set(catalog.schedule.filter((day) => state.dayStatus[day.id] === "done").map((day) => day.day));
  let currentSet = false;
  const milestoneIcons = ["sensors", "api", "ui", "ai", "check"];
  const steps = catalog.milestones
    .map((item, index) => {
      const dayNumber = Number(item.day.replace("Day ", ""));
      const done = doneDays.has(dayNumber);
      let klass = "";
      if (done) klass = "done";
      else if (!currentSet) {
        klass = "current";
        currentSet = true;
      }
      return `<button class="path-step ${klass} reveal" style="--i:${index}" type="button" data-goto="schedule">
        <span class="path-step-top">${iconBadge(milestoneIcons[index] || "milestones")}<b>${esc(item.code)} · ${esc(item.day)}</b></span>
        <strong>${esc(item.title)}</strong>
        <span class="muted">${esc(item.detail)}</span>
      </button>`;
    })
    .join("");
  return `<section class="section card reveal" id="section-milestones">${sectionHead("Release path", "milestones")}<div class="section-body"><div class="path">${steps}</div></div></section>`;
}

function renderSchedule() {
  const rows = catalog.schedule
    .map(
      (day) => `<tr>
        <td><span class="day-cell">${iconBadge("schedule", "ui-icon-inline")}<strong>Day ${day.day}</strong></span></td>
        <td><strong>${esc(day.title)}</strong><div class="muted">${esc(day.work)}</div></td>
        <td>${esc(day.deliverable)}</td>
        <td>${statusSelect(day.id)}</td>
      </tr>`
    )
    .join("");
  return `<section class="section card reveal" id="section-schedule">${sectionHead("10-day plan", "schedule", `<span class="muted">A tight 7-day plan runs days 5–6 together and shortens the soak to 24 h.</span>`)}<div class="table-wrap"><table><thead><tr><th>Day</th><th>Work</th><th>Deliverable</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderProjects() {
  const project = catalog.projects.find((item) => item.id === projectTab);
  const tabs = catalog.projects
    .map(
      (item) =>
        `<button class="tab ${item.id === projectTab ? "active" : ""}" type="button" data-project="${item.id}">${iconBadge(item.id, "ui-icon-inline")}${esc(item.name)}</button>`
    )
    .join("");
  const steps = project.steps.map((step, index) => check(`${project.id}-step-${index}`, step)).join("");
  const criteria = project.criteria.map((item) => check(item.id, item.text)).join("");
  return `<section class="section card reveal" id="section-projects">
    ${sectionHead("Acceptance", "projects")}
    <div class="tabs">${tabs}</div>
    <div class="section-body split">
      <div><h3>${iconBadge("check", "ui-icon-inline")} Build steps</h3>${steps}</div>
      <div><h3>${iconBadge("tests", "ui-icon-inline")} Done when</h3>${criteria}</div>
    </div>
  </section>`;
}

function renderTests() {
  const rows = catalog.tests
    .map((test) => {
      const result = state.testResult[test.id] || "";
      return `<tr class="${result}"><td>${esc(test.id)}</td><td>${esc(test.area)}</td><td>${esc(test.name)}</td><td>${esc(test.expect)}</td><td>${resultSelect(test.id)}</td></tr>`;
    })
    .join("");
  return `<section class="section card reveal" id="section-tests">${sectionHead("Test matrix", "tests")}<div class="table-wrap"><table><thead><tr><th>ID</th><th>Area</th><th>Test</th><th>Expected</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function bomPhoto(item, klass = "bom-photo") {
  const src = item.image || `/static/products/${item.id}.jpg`;
  return `<img class="${klass}" src="${esc(src)}" alt="${esc(item.item)}" loading="lazy" width="120" height="90">`;
}

function renderBom() {
  const groups = ["All", "Core", "Optional", "Phase 2"];
  const rows = catalog.bom.filter((item) => bomFilter === "All" || item.group === bomFilter);
  const selected = rows.reduce((sum, item) => sum + item.price * item.qty, 0);
  const received = catalog.bom.filter((item) => state.bom[item.id]?.received).reduce((sum, item) => sum + item.price, 0);
  const cards = rows
    .map((item, index) => {
      const flags = state.bom[item.id] || {};
      return `<article class="bom-card reveal" style="--i:${index}">
        <div class="bom-card-media">${bomPhoto(item, "bom-photo-lg")}</div>
        <div class="bom-card-body">
          <div class="bom-card-top">
            <h3>${esc(item.item)}</h3>
            ${pill(item.check)}
          </div>
          <p class="muted">${esc(item.group)} · ${esc(item.seller)} · ₹${inr.format(item.price)}</p>
          ${item.note ? `<p class="muted bom-note">${esc(item.note)}</p>` : ""}
          <div class="bom-card-actions">
            <label class="check"><input type="checkbox" data-bom="${item.id}" data-flag="ordered" ${flags.ordered ? "checked" : ""}>Ordered</label>
            <label class="check"><input type="checkbox" data-bom="${item.id}" data-flag="received" ${flags.received ? "checked" : ""}>Received</label>
          </div>
        </div>
      </article>`;
    })
    .join("");
  const body = rows
    .map((item) => {
      const flags = state.bom[item.id] || {};
      return `<tr>
        <td><div class="bom-item-cell">${bomPhoto(item, "bom-photo-sm")}<div><strong>${esc(item.item)}</strong><div class="muted">${esc(item.note)}</div></div></div></td>
        <td>${esc(item.group)}</td>
        <td>${esc(item.seller)}</td>
        <td>₹${inr.format(item.price)}</td>
        <td>${pill(item.check)}</td>
        <td><label class="check"><input type="checkbox" data-bom="${item.id}" data-flag="ordered" ${flags.ordered ? "checked" : ""}>Ordered</label>
            <label class="check"><input type="checkbox" data-bom="${item.id}" data-flag="received" ${flags.received ? "checked" : ""}>Received</label></td>
      </tr>`;
    })
    .join("");
  const filters = groups
    .map((group) => `<button class="btn ${group === bomFilter ? "btn-brand" : "btn-neutral"}" type="button" data-bom-filter="${group}">${group}</button>`)
    .join(" ");
  return `<section class="section card reveal" id="section-bom">
    ${sectionHead("Bill of materials", "bom", `<span class="muted">Showing ₹${inr.format(selected)} · received ₹${inr.format(received)}</span>`)}
    <div class="section-body">
      ${filters}
      <p class="muted">Prices are GST-included live listings from 18 Oct 2026. Shipping is extra. Core subtotal is ₹1,656. Photos are local product images for each part.</p>
      <div class="bom-grid">${cards}</div>
    </div>
    <div class="table-wrap bom-table"><table><thead><tr><th>Item</th><th>Group</th><th>Seller</th><th>Price</th><th>Check</th><th>Procurement</th></tr></thead><tbody>${body}</tbody></table></div>
  </section>`;
}

function renderBudget() {
  const budget = catalog.budget
    .map((row) => `<tr><td>${esc(row.scenario)}</td><td>${esc(row.hosting)}</td><td>${esc(row.ai)}</td><td><strong>${esc(row.total)}</strong></td></tr>`)
    .join("");
  const volumes = catalog.volumes
    .map((row) => `<tr><td>${esc(row.label)}</td><td><strong>${esc(row.unit)}</strong></td><td>${esc(row.note)}</td></tr>`)
    .join("");
  return `<section class="section card reveal" id="section-budget">${sectionHead("Cost and volume", "budget")}
    <div class="table-wrap"><table><thead><tr><th>Monthly scenario</th><th>Hosting</th><th>AI</th><th>Total</th></tr></thead><tbody>${budget}</tbody></table></div>
    <div class="table-wrap"><table><thead><tr><th>Hardware volume</th><th>Per unit</th><th>Basis</th></tr></thead><tbody>${volumes}</tbody></table></div></section>`;
}

function renderRisks() {
  const rows = catalog.risks
    .map((risk) => `<tr><td><strong>${esc(risk.risk)}</strong></td><td>${esc(risk.impact)}</td><td>${pill(risk.likelihood)}</td><td>${esc(risk.mitigation)}</td></tr>`)
    .join("");
  return `<section class="section card reveal" id="section-risks">${sectionHead("Risks", "risks")}<div class="table-wrap"><table><thead><tr><th>Risk</th><th>Impact</th><th>Likelihood</th><th>Mitigation</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderWiring() {
  const rows = catalog.pins
    .map((pin) => `<tr><td>${esc(pin.module)}</td><td>${esc(pin.pin)}</td><td><strong>${esc(pin.esp)}</strong></td><td>${esc(pin.note)}</td></tr>`)
    .join("");
  return `<section class="section card reveal" id="section-wiring">${sectionHead("Pinout", "wiring", `<span class="muted">ESP32 DevKit V1, USB powered in v1</span>`)}<div class="table-wrap"><table><thead><tr><th>Module</th><th>Module pin</th><th>ESP32</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderDecisions() {
  const cards = catalog.decisions
    .map(
      (item, index) => `<article class="card decision-card reveal" style="--i:${index}">
        <div class="card-head"><div class="section-title">${iconBadge("decisions")}<h3>${index + 1}. ${esc(item.title)}</h3></div></div>
        <div class="section-body"><p>${esc(item.why)}</p></div>
      </article>`
    )
    .join("");
  return `<section class="section" id="section-decisions"><div class="decision-grid">${cards}</div></section>`;
}

function renderPhase2() {
  const items = catalog.phase2.map((item, index) => check(`phase2-${index}`, item)).join("");
  return `<section class="section card reveal" id="section-phase2">${sectionHead("Phase 2 backlog", "phase2", `<span class="muted">After v1 acceptance</span>`)}<div class="section-body">${items}</div></section>`;
}

function renderFixes() {
  const rows = catalog.troubleshooting
    .map((item) => `<tr><td><strong>${esc(item.symptom)}</strong></td><td>${esc(item.fix)}</td></tr>`)
    .join("");
  return `<section class="section card reveal" id="section-troubleshooting">${sectionHead("Troubleshooting", "troubleshooting")}<div class="table-wrap"><table><thead><tr><th>Symptom</th><th>Fix</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderCustom(section) {
  const custom = state.custom.find((item) => item.id === section.id);
  return `<section class="section card reveal" id="section-${section.id}">
    ${sectionHead(custom.title, "notes", `<button class="btn btn-neutral" type="button" data-remove-custom="${custom.id}">Remove</button>`)}
    <div class="section-body"><p style="white-space:pre-wrap">${esc(custom.body)}</p></div>
  </section>`;
}

function renderNotes() {
  const log = state.log
    .map((entry) => `<li><time>${esc(new Date(entry.at).toLocaleString())}</time>${esc(entry.text)}</li>`)
    .join("");
  return `<section class="section card reveal" id="section-notes">
    ${sectionHead("Build notes", "notes")}
    <div class="section-body split">
      <form id="note-form">
        <label for="note">Shared note</label>
        <textarea id="note" class="note-box" maxlength="240" placeholder="What changed on the bench"></textarea>
        <button class="btn btn-brand" type="submit">Add note</button>
      </form>
      <ul class="log">${log || "<li class='muted'>No notes yet.</li>"}</ul>
    </div>
  </section>`;
}

const renderers = {
  overview: renderOverview,
  purpose: renderPurpose,
  milestones: renderMilestones,
  schedule: renderSchedule,
  projects: renderProjects,
  tests: renderTests,
  bom: renderBom,
  budget: renderBudget,
  risks: renderRisks,
  wiring: renderWiring,
  decisions: renderDecisions,
  phase2: renderPhase2,
  troubleshooting: renderFixes,
};

function ownerName() {
  return (catalog && catalog.project && catalog.project.owner) || "Lalit Sonawane";
}

function renderOwnerCredit(variant = "plaque") {
  const name = ownerName();
  if (variant === "compact") {
    return `<aside class="owner-credit owner-credit-compact" aria-label="Idea owner and developer">
      <span class="owner-mono" aria-hidden="true">LS</span>
      <span class="owner-compact-copy"><strong>${esc(name)}</strong><span>Idea owner · Developer</span></span>
    </aside>`;
  }
  return `<aside class="owner-credit owner-credit-plaque reveal" aria-label="Idea owner and developer">
    <div class="owner-credit-glow" aria-hidden="true"></div>
    <div class="owner-mono owner-mono-lg" aria-hidden="true">LS</div>
    <div class="owner-credit-body">
      <p class="eyebrow">Project authorship</p>
      <p class="owner-name">${esc(name)}</p>
      <div class="owner-roles">
        <span class="owner-role">${iconBadge("decisions", "ui-icon-inline")}Idea owner</span>
        <span class="owner-role">${iconBadge("console", "ui-icon-inline")}Developer</span>
      </div>
      <p class="muted owner-blurb">Originated and developed this AI-enabled IoT build — plant care, room environment, and privacy-bounded home events on one ESP32 node.</p>
    </div>
  </aside>`;
}

function renderPageNav() {
  const current = page();
  return `<div class="page-nav">
    <a class="page-nav-link ${current === "console" ? "active" : ""}" href="/">${iconBadge("console", "ui-icon-inline")}Build console</a>
    <a class="page-nav-link ${current === "flow" ? "active" : ""}" href="/flow">${iconBadge("flow", "ui-icon-inline")}Design flow</a>
  </div>`;
}

function renderNav() {
  const current = page();
  const pageLinks = `
    <a class="nav-link ${current === "console" ? "active" : ""}" href="/">${iconBadge("console", "ui-icon-inline")}<span>Build console</span></a>
    <a class="nav-link ${current === "flow" ? "active" : ""}" href="/flow">${iconBadge("flow", "ui-icon-inline")}<span>Design flow</span></a>
    <div class="nav-divider"></div>`;
  if (current === "flow") {
    sidenav.innerHTML = `${pageLinks}<p class="nav-note muted">Runtime path from sensors to advisory AI.</p>`;
    return;
  }
  const sections = state.order.map(sectionMeta).filter((section) => section && !state.hidden.includes(section.id));
  sidenav.innerHTML =
    pageLinks +
    sections
      .map((section) => {
        const icon = section.custom ? "notes" : section.id;
        return `<button class="nav-link" type="button" data-goto="${section.id}">${iconBadge(icon, "ui-icon-inline")}<span>${esc(section.nav)}</span></button>`;
      })
      .join("");
}

function flowIcon(kind) {
  const common = 'class="ui-icon-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  const icons = {
    sensors: `<svg ${common}><path d="M12 3v4M8.5 5.5 12 9l3.5-3.5"/><circle cx="12" cy="12" r="2.4"/><path d="M5 12h3.2M15.8 12H19M7.2 16.8 9.5 14.5M14.5 14.5l2.3 2.3"/><path d="M12 14.4V21"/></svg>`,
    esp32: `<svg ${common}><rect x="5" y="4" width="14" height="16" rx="1.5"/><path d="M8 8h8M8 11h8M8 14h5"/><path d="M3 8h2M3 12h2M3 16h2M19 8h2M19 12h2M19 16h2"/></svg>`,
    api: `<svg ${common}><ellipse cx="12" cy="6.5" rx="6.5" ry="2.5"/><path d="M5.5 6.5v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4"/><path d="M5.5 10.5v4c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-4"/><path d="M5.5 14.5v3c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-3"/></svg>`,
    ui: `<svg ${common}><rect x="3.5" y="5" width="17" height="12" rx="1.5"/><path d="M3.5 8.5h17M8 17.5h8"/><path d="M7 11h4M7 13.5h6"/></svg>`,
    ai: `<svg ${common}><path d="M7 16c-2.4-1-4-2.7-4-4.7C3 8 7 6 12 6s9 2 9 5.3c0 2-1.6 3.7-4 4.7"/><path d="M9.5 16.5 8 21l4-2.2L16 21l-1.5-4.5"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/></svg>`,
    plant: `<svg ${common}><path d="M12 21v-8"/><path d="M12 13c-3.2-1.2-5-3.6-5-6.2 2.8 0 5 1.8 5 4.8 0-3 2.2-4.8 5-4.8 0 2.6-1.8 5-5 6.2z"/><path d="M8 21h8"/></svg>`,
    room: `<svg ${common}><path d="M4 19V9.5L12 4l8 5.5V19"/><path d="M9 19v-6h6v6"/><path d="M4 19h16"/></svg>`,
    events: `<svg ${common}><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke-dasharray="2.2 2.4"/><circle cx="12" cy="12" r="8.5" fill="none" stroke-dasharray="1.6 3.2"/><path d="M12 2.8v2.2M12 19v2.2M2.8 12h2.2M19 12h2.2"/></svg>`,
    overview: `<svg ${common}><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></svg>`,
    purpose: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16.2v.6"/></svg>`,
    milestones: `<svg ${common}><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h3M14 12h3"/></svg>`,
    schedule: `<svg ${common}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="M8 14h3M13 14h3M8 17h5"/></svg>`,
    projects: `<svg ${common}><path d="M8 6h11v13H8z"/><path d="M5 9h11v13H5z"/><path d="M11 12h5M11 15h4"/></svg>`,
    tests: `<svg ${common}><path d="M9 3h6v4l-2.2 3.2A4.6 4.6 0 0 1 12 18a4.6 4.6 0 0 1-.8-7.8L9 7V3z"/><path d="M10 21h4"/></svg>`,
    bom: `<svg ${common}><path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z"/><path d="M12 12v8M4 8.5l8 3.5 8-3.5"/></svg>`,
    budget: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.2 9.2c.7-1 2-1.5 2.8-1.5 1.5 0 2.6.8 2.6 2s-1.1 2-2.6 2c-1.6 0-2.7.8-2.7 2S10.7 16 12.2 16c1 0 2-.5 2.7-1.4"/></svg>`,
    risks: `<svg ${common}><path d="M12 3 21 19H3L12 3z"/><path d="M12 9v5M12 16.5v.5"/></svg>`,
    wiring: `<svg ${common}><circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="M8 7h8M6 9v4.5L12 15M18 9v4.5L12 15"/></svg>`,
    decisions: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>`,
    phase2: `<svg ${common}><path d="M5 17 12 4l7 13H5z"/><path d="M9 17h6l-3-5.5z"/></svg>`,
    troubleshooting: `<svg ${common}><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M9 11h4M11 9v4"/></svg>`,
    notes: `<svg ${common}><path d="M6 4h9l3 3v13H6z"/><path d="M15 4v3h3M9 11h6M9 14h6M9 17h4"/></svg>`,
    console: `<svg ${common}><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 18h10M8 9l2 2-2 2M12 13h4"/></svg>`,
    flow: `<svg ${common}><path d="M5 7h6v4H5zM13 13h6v4h-6z"/><path d="M11 9h4v2M13 11v2"/></svg>`,
    money: `<svg ${common}><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 14h3"/></svg>`,
    parts: `<svg ${common}><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M10.2 10.2 13.8 13.8"/></svg>`,
    check: `<svg ${common}><circle cx="12" cy="12" r="8"/><path d="M8.5 12.2 11 14.7 15.5 9.5"/></svg>`,
    days: `<svg ${common}><path d="M4 12h16M12 4v16"/><circle cx="12" cy="12" r="8"/></svg>`,
  };
  return icons[kind] || icons.ui;
}

function iconBadge(kind, extraClass = "") {
  return `<span class="ui-icon ${extraClass}" aria-hidden="true">${flowIcon(kind)}</span>`;
}

function sectionHead(title, icon, trailing = "") {
  return `<div class="section-head">
    <div class="section-title">${iconBadge(icon)}<h2>${esc(title)}</h2></div>
    ${trailing}
  </div>`;
}

function progressRing(pct) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return `<svg class="progress-ring" viewBox="0 0 72 72" aria-hidden="true">
    <circle class="progress-ring-track" cx="36" cy="36" r="${r}"/>
    <circle class="progress-ring-value" cx="36" cy="36" r="${r}"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/>
    <text x="36" y="39" text-anchor="middle">${pct}%</text>
  </svg>`;
}

function flowWatermark() {
  return `<svg class="flow-watermark" viewBox="0 0 960 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="48" y="42" width="96" height="64" rx="4"/>
      <path d="M64 58h64M64 74h48M64 90h56"/>
      <path d="M40 58h-16M40 74h-16M40 90h-16M160 58h16M160 74h16M160 90h16"/>
      <path d="M220 70h70l12-14 18 28 14-18 40 4"/>
      <path d="M280 40v22M320 52v34"/>
      <circle cx="220" cy="70" r="3.5"/><circle cx="374" cy="70" r="3.5"/>
      <path d="M420 50h90v70H420z"/><path d="M436 70h58M436 90h42"/>
      <path d="M465 40v10M465 120v14M510 40v10M510 120v14"/>
      <path d="M560 48c28-22 70-22 98 0 20 16 20 42 0 58-28 22-70 22-98 0-20-16-20-42 0-58z"/>
      <path d="M610 78v48M590 126h40"/>
      <rect x="700" y="36" width="72" height="48" rx="3"/><path d="M712 52h48M712 66h36"/>
      <path d="M780 60h40M820 60v40H700"/>
      <path d="M70 180h120M70 180v90h40"/><circle cx="70" cy="180" r="3"/><circle cx="190" cy="180" r="3"/><circle cx="110" cy="270" r="3"/>
      <path d="M210 210h28l10-16 16 32 10-16h34"/><path d="M250 170v30M290 190v50"/>
      <rect x="360" y="168" width="110" height="78" rx="4"/><circle cx="384" cy="196" r="8"/><circle cx="416" cy="196" r="8"/><circle cx="448" cy="196" r="8"/>
      <path d="M384 214v16M416 214v16M448 214v16M372 246h86"/>
      <path d="M520 190h160M520 230h120M680 190v80"/><circle cx="520" cy="190" r="3"/><circle cx="680" cy="190" r="3"/><circle cx="640" cy="230" r="3"/><circle cx="680" cy="270" r="3"/>
      <path d="M720 200c24 0 40 12 40 28s-16 28-40 28h-18"/><path d="M750 200c14-16 40-18 56-4 10 8 12 22 4 32"/>
      <path d="M80 320h60l20 28 24-44 20 36h70"/><circle cx="80" cy="320" r="3"/><circle cx="274" cy="340" r="3"/>
      <rect x="320" y="300" width="84" height="56" rx="3"/><path d="M336 320h52M336 336h36"/><path d="M362 288v12M362 356v16"/>
      <path d="M450 330h90M540 330v-36h70"/><circle cx="450" cy="330" r="3"/><circle cx="610" cy="294" r="3"/>
      <rect x="650" y="300" width="130" height="70" rx="4"/><path d="M670 324h90M670 344h70M670 364h50"/>
      <path d="M790 280v90M820 300v50M850 290v70"/>
    </g>
  </svg>`;
}

function renderFlowDiagram(flow) {
  const stages = flow.stages;
  const apps = flow.apps || [];
  const stageNodes = stages
    .map((stage, index) => {
      const connector =
        index < stages.length - 1
          ? `<div class="flow-edge" style="--i:${index}" aria-hidden="true">
              <svg class="flow-edge-svg" viewBox="0 0 40 12" preserveAspectRatio="none">
                <path class="flow-link" d="M0 6 H34" marker-end="url(#flow-arrow-sm)"/>
                <circle class="flow-pulse" r="2.5" cx="0" cy="6">
                  <animate attributeName="cx" from="2" to="30" dur="2.8s" begin="${0.7 + index * 0.25}s" repeatCount="indefinite"/>
                </circle>
              </svg>
            </div>`
          : "";
      return `<article class="flow-node" style="--i:${index}">
        <div class="flow-node-top">
          <span class="flow-icon">${flowIcon(stage.id)}</span>
          <span class="flow-step">${String(index + 1).padStart(2, "0")}</span>
        </div>
        <h3>${esc(stage.label)}</h3>
        <p>${esc(stage.detail)}</p>
        <span class="flow-hint">${esc(stage.hint)}</span>
      </article>${connector}`;
    })
    .join("");

  const appNodes = apps
    .map(
      (item, index) => `<article class="flow-app" style="--i:${index}">
        <div class="flow-node-top">
          <span class="flow-icon flow-icon-app">${flowIcon(item.id)}</span>
        </div>
        <h3>${esc(item.label)}</h3>
        <p>${esc(item.from)}</p>
      </article>`
    )
    .join("");

  return `<div class="flow-canvas" role="img" aria-label="Design flow from sensors to cloud AI">
    ${flowWatermark()}
    <svg class="flow-defs" width="0" height="0" aria-hidden="true">
      <defs>
        <marker id="flow-arrow-sm" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#0176d3"/>
        </marker>
      </defs>
    </svg>
    <div class="flow-foreground">
      <div class="flow-track">${stageNodes}</div>
      <div class="flow-branch-label muted">Dashboard fans out to the three apps</div>
      <div class="flow-apps">${appNodes}</div>
    </div>
  </div>`;
}

function renderFlow() {
  const flow = catalog.designFlow;
  return `
    ${renderPageNav()}
    <div class="page-head">
      <div>
        <p class="eyebrow">${esc(flow.eyebrow)} · ${esc(catalog.project.version)}</p>
        <h1>${esc(flow.title)}</h1>
        <p class="muted flow-intro">${esc(flow.intro)}</p>
      </div>
      ${renderOwnerCredit("compact")}
    </div>
    <section class="section card flow-panel">
      <div class="section-head"><h2>Product data path</h2><span class="pill ok">M1 → M4</span></div>
      <div class="section-body flow-body">
        ${renderFlowDiagram(flow)}
        <p class="muted flow-source">Source: ${esc(flow.source)}</p>
      </div>
    </section>`;
}

function renderConsole() {
  const sections = visibleSections();
  return `
    <div class="console-hero">
      ${flowWatermark().replace('class="flow-watermark"', 'class="flow-watermark console-watermark"')}
      <div class="console-hero-inner">
        ${renderPageNav()}
        <div class="page-head">
          <div>
            <p class="eyebrow">${esc(catalog.project.version)} · ${esc(catalog.project.date)}</p>
            <h1>${esc(catalog.project.name)}</h1>
            <p class="muted">Developer record for progress, parts and acceptance. Changes save to this host, so another computer sees the same board.</p>
          </div>
          <div class="hero-badges">
            ${iconBadge("esp32")}${iconBadge("sensors")}${iconBadge("ai")}
          </div>
        </div>
        ${renderOwnerCredit("plaque")}
      </div>
    </div>
    ${sections
      .map((section) => (section.custom ? renderCustom(section) : renderers[section.id]()))
      .join("")}
    ${renderNotes()}`;
}

function render() {
  const current = page();
  document.body.dataset.page = current;
  main.innerHTML = current === "flow" ? renderFlow() : renderConsole();
  if (current === "console" && query) {
    [...main.querySelectorAll(".section")].forEach((section) => {
      if (!section.textContent.toLowerCase().includes(query)) section.classList.add("hidden");
    });
  }
  renderNav();
  const stats = progress();
  document.querySelector("#progress-label").textContent =
    current === "flow" ? "Design flow · sensors → AI" : `${stats.pct}% of tracked work complete`;
  const openBuilder = document.querySelector("#open-builder");
  if (openBuilder) openBuilder.classList.toggle("hidden", current === "flow");
  renderBuilder();
}

function renderBuilder() {
  const list = document.querySelector("#builder-list");
  list.innerHTML = state.order
    .map((id) => {
      const section = sectionMeta(id);
      if (!section) return "";
      const shown = !state.hidden.includes(id);
      return `<li class="builder-row">
        <label class="check"><input type="checkbox" data-show="${id}" ${shown ? "checked" : ""}><span>${esc(section.title)}</span></label>
        <span class="builder-actions">
          <button class="btn btn-neutral" type="button" data-move="${id}" data-dir="-1">Up</button>
          <button class="btn btn-neutral" type="button" data-move="${id}" data-dir="1">Down</button>
        </span>
      </li>`;
    })
    .join("");
}

function showLogin() {
  app.classList.add("hidden");
  login.classList.remove("hidden");
}

function showApp() {
  login.classList.add("hidden");
  app.classList.remove("hidden");
  render();
}

function openBuilder(open) {
  builder.classList.toggle("hidden", !open);
  scrim.classList.toggle("hidden", !open);
}

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = document.querySelector("#code").value;
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const body = await response.json();
  if (!response.ok) {
    document.querySelector("#login-error").textContent = body.error || "Could not sign in.";
    return;
  }
  await boot();
});

document.querySelector("#logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  showLogin();
});

document.querySelector("#search").addEventListener("input", (event) => {
  query = event.target.value.trim().toLowerCase();
  render();
});

document.querySelector("#open-builder").addEventListener("click", () => openBuilder(true));
document.querySelector("#close-builder").addEventListener("click", () => openBuilder(false));
scrim.addEventListener("click", () => {
  openBuilder(false);
  sidenav.classList.remove("open");
});
document.querySelector("#nav-toggle").addEventListener("click", () => sidenav.classList.toggle("open"));
document.querySelector("#jump-notes").addEventListener("click", () => {
  document.querySelector("#section-notes")?.scrollIntoView({ behavior: "smooth" });
});

document.querySelector("#custom-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const title = document.querySelector("#custom-title").value.trim();
  const body = document.querySelector("#custom-body").value.trim();
  const id = `custom-${Date.now().toString(36)}`;
  state.custom.push({ id, title, body });
  state.order.push(id);
  remember(`Added section “${title}”`);
  event.target.reset();
  queueSave();
  showToast("Section added");
});

document.querySelector("#builder-list").addEventListener("click", (event) => {
  const move = event.target.closest("[data-move]");
  if (!move) return;
  const id = move.dataset.move;
  const dir = Number(move.dataset.dir);
  const index = state.order.indexOf(id);
  const next = index + dir;
  if (index < 0 || next < 0 || next >= state.order.length) return;
  const [item] = state.order.splice(index, 1);
  state.order.splice(next, 0, item);
  queueSave();
});

document.querySelector("#builder-list").addEventListener("change", (event) => {
  const box = event.target.closest("[data-show]");
  if (!box) return;
  const id = box.dataset.show;
  if (box.checked) state.hidden = state.hidden.filter((item) => item !== id);
  else if (!state.hidden.includes(id)) state.hidden.push(id);
  queueSave();
});

main.addEventListener("change", (event) => {
  const target = event.target;
  if (target.dataset.check) {
    state.checks[target.dataset.check] = target.checked;
    queueSave();
  }
  if (target.dataset.day) {
    state.dayStatus[target.dataset.day] = target.value;
    queueSave();
  }
  if (target.dataset.test) {
    if (target.value) state.testResult[target.dataset.test] = target.value;
    else delete state.testResult[target.dataset.test];
    queueSave();
  }
  if (target.dataset.bom) {
    const current = state.bom[target.dataset.bom] || { ordered: false, received: false };
    current[target.dataset.flag] = target.checked;
    state.bom[target.dataset.bom] = current;
    queueSave();
  }
});

main.addEventListener("click", (event) => {
  const project = event.target.closest("[data-project]");
  if (project) {
    projectTab = project.dataset.project;
    render();
    return;
  }
  const filter = event.target.closest("[data-bom-filter]");
  if (filter) {
    bomFilter = filter.dataset.bomFilter;
    render();
    return;
  }
  const remove = event.target.closest("[data-remove-custom]");
  if (remove) {
    const id = remove.dataset.removeCustom;
    state.custom = state.custom.filter((item) => item.id !== id);
    state.order = state.order.filter((item) => item !== id);
    state.hidden = state.hidden.filter((item) => item !== id);
    remember("Removed a custom section");
    queueSave();
    return;
  }
  const goto = event.target.closest("[data-goto]");
  if (goto) {
    document.getElementById(`section-${goto.dataset.goto}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    sidenav.classList.remove("open");
  }
});

main.addEventListener("submit", (event) => {
  if (event.target.id !== "note-form") return;
  event.preventDefault();
  const text = document.querySelector("#note").value.trim();
  if (!text) return;
  remember(text);
  queueSave();
});

sidenav.addEventListener("click", (event) => {
  const goto = event.target.closest("[data-goto]");
  if (!goto) return;
  document.getElementById(`section-${goto.dataset.goto}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  sidenav.classList.remove("open");
});

async function boot() {
  const response = await fetch("/api/bootstrap");
  if (response.status === 401) {
    showLogin();
    return;
  }
  const body = await response.json();
  catalog = body.catalog;
  state = body.state;
  showApp();
}

boot();
