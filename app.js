const STORAGE_KEY = "telecom-line-checker.records.v1";
const PIN_KEY = "telecom-line-checker.pin.v1";
const LAST_BACKUP_KEY = "telecom-line-checker.last-backup.v1";
const COLLAPSED_KEY = "telecom-line-checker.collapsed-owners.v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;

const appRoot = document.querySelector(".app");
const form = document.querySelector("#lineForm");
const ownerInput = document.querySelector("#ownerInput");
const carrierInput = document.querySelector("#carrierInput");
const dateInput = document.querySelector("#dateInput");
const phoneInput = document.querySelector("#phoneInput");
const ownerFilter = document.querySelector("#ownerFilter");
const tableBody = document.querySelector("#lineTable");
const summaryGrid = document.querySelector("#summaryGrid");
const emptyState = document.querySelector("#emptyState");
const todayText = document.querySelector("#todayText");
const backupButton = document.querySelector("#backupButton");
const restoreButton = document.querySelector("#restoreButton");
const restoreInput = document.querySelector("#restoreInput");
const backupStatus = document.querySelector("#backupStatus");
const pinButton = document.querySelector("#pinButton");
const submitButton = document.querySelector("#submitButton");
const cancelEditButton = document.querySelector("#cancelEditButton");
const duplicateWarning = document.querySelector("#duplicateWarning");
const backupNotice = document.querySelector("#backupNotice");
const pinLock = document.querySelector("#pinLock");
const pinUnlockInput = document.querySelector("#pinUnlockInput");
const pinUnlockButton = document.querySelector("#pinUnlockButton");
const pinMessage = document.querySelector("#pinMessage");
const splashScreen = document.querySelector("#splashScreen");

let records = loadRecords();
let collapsedOwners = loadCollapsedOwners();
let editingId = null;

dateInput.value = todayInputDate();
todayText.textContent = formatCompactDate(todayInputDate());
pinButton.textContent = localStorage.getItem(PIN_KEY) ? "PIN 변경" : "PIN 설정";

initSplashScreen();
initPinLock();
render();

phoneInput.addEventListener("input", () => {
  phoneInput.value = formatPhoneNumber(phoneInput.value);
  updateDuplicateWarning();
});

ownerInput.addEventListener("input", updateDuplicateWarning);
carrierInput.addEventListener("input", updateDuplicateWarning);
dateInput.addEventListener("input", updateDuplicateWarning);
ownerFilter.addEventListener("change", render);

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const record = {
    id: editingId || makeId(),
    owner: ownerInput.value.trim(),
    carrier: carrierInput.value.trim(),
    openedAt: dateInput.value,
    phone: formatPhoneNumber(phoneInput.value),
    status: records.find((item) => item.id === editingId)?.status || "confirmed",
    memo: records.find((item) => item.id === editingId)?.memo || "",
    createdAt: records.find((item) => item.id === editingId)?.createdAt || new Date().toISOString(),
  };

  if (!record.owner || !record.carrier || !record.openedAt || !record.phone) return;

  const duplicate = findDuplicate(record.phone, record.id);
  if (duplicate && !confirm(`${duplicate.owner} 명의에 같은 번호가 이미 있습니다. 그래도 저장할까요?`)) {
    return;
  }

  records = editingId
    ? records.map((item) => (item.id === editingId ? record : item))
    : [...records, record];

  saveRecords();
  resetForm();
  render();
});

backupButton.addEventListener("click", () => {
  savePlainBackup();
});

restoreButton.addEventListener("click", () => {
  restoreInput.click();
});

restoreInput.addEventListener("change", () => {
  const file = restoreInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    try {
      let parsed = JSON.parse(String(reader.result || ""));
      const importedRecords = normalizeBackupRecords(parsed);
      if (!importedRecords.length) {
        alert("불러올 회선 데이터가 없습니다.");
        return;
      }

      const replace = confirm(
        `백업 파일에 ${importedRecords.length}개 회선이 있습니다.\n\n확인: 현재 목록을 지우고 백업 파일로 교체\n취소: 현재 목록은 두고 백업 파일을 추가`,
      );

      records = replace ? importedRecords : dedupeRecords([...records, ...importedRecords]);
      saveRecords();
      render();
    } catch {
      alert("백업 파일을 읽을 수 없습니다. 파일 또는 비밀번호를 확인해주세요.");
    } finally {
      restoreInput.value = "";
    }
  });
  reader.readAsText(file, "utf-8");
});

tableBody.addEventListener("click", (event) => {
  const groupButton = event.target.closest("[data-owner-toggle]");
  if (groupButton) {
    toggleOwner(groupButton.dataset.ownerToggle);
    return;
  }

  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    startEdit(editButton.dataset.editId);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) return;

  const target = records.find((record) => record.id === deleteButton.dataset.deleteId);
  if (!target) return;

  const ok = confirm(
    `${target.owner} / ${target.carrier} / ${target.phone}\n신규날짜 ${formatDate(target.openedAt)}\n\n이 회선을 삭제할까요?`,
  );
  if (!ok) return;

  if (editingId === target.id) resetForm();
  records = records.filter((record) => record.id !== target.id);
  saveRecords();
  render();
});

cancelEditButton.addEventListener("click", resetForm);

summaryGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-summary-owner]");
  if (!card) return;
  scrollToOwner(card.dataset.summaryOwner);
});

summaryGrid.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-summary-owner]");
  if (!card) return;
  event.preventDefault();
  scrollToOwner(card.dataset.summaryOwner);
});

pinButton.addEventListener("click", async () => {
  const existing = localStorage.getItem(PIN_KEY);
  if (existing) {
    const current = prompt("현재 PIN을 입력하세요.");
    if (!current || (await hashPin(current)) !== existing) {
      alert("현재 PIN이 맞지 않습니다.");
      return;
    }
  }

  const next = prompt("새 PIN을 입력하세요. 비워두면 잠금이 해제됩니다.");
  if (!next) {
    localStorage.removeItem(PIN_KEY);
    pinButton.textContent = "PIN 설정";
    alert("PIN 잠금을 해제했습니다.");
    return;
  }

  localStorage.setItem(PIN_KEY, await hashPin(next));
  pinButton.textContent = "PIN 변경";
  alert("PIN을 설정했습니다.");
});

pinUnlockButton.addEventListener("click", unlockWithPin);
pinUnlockInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlockWithPin();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function render() {
  appRoot.classList.toggle("has-records", records.length > 0);
  renderOwnerFilter();
  renderBackupStatus();
  renderBackupNotice();
  renderDueNotice();
  renderSummary();
  renderTable();
}

function initSplashScreen() {
  if (!splashScreen) return;

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const displayTime = prefersReducedMotion ? 700 : 1700;

  window.setTimeout(() => {
    splashScreen.classList.add("is-hidden");
    splashScreen.addEventListener("transitionend", () => splashScreen.remove(), { once: true });
    window.setTimeout(() => splashScreen.remove(), 700);
  }, displayTime);
}

function renderOwnerFilter() {
  const selected = ownerFilter.value;
  const owners = [...new Set(records.map((record) => record.owner))].sort((a, b) =>
    a.localeCompare(b, "ko", { numeric: true }),
  );

  ownerFilter.innerHTML = `<option value="all">전체</option>`;
  for (const owner of owners) {
    const option = document.createElement("option");
    option.value = owner;
    option.textContent = owner;
    ownerFilter.append(option);
  }

  ownerFilter.value = owners.includes(selected) ? selected : "all";
}

function renderBackupNotice() {
  backupNotice.classList.remove("due-notice");
  const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
  const daysSinceBackup = lastBackup
    ? Math.floor((dateValue(todayInputDate()) - dateValue(lastBackup.slice(0, 10))) / DAY_MS)
    : Infinity;
  const shouldShow = records.length >= 20 || daysSinceBackup >= 7;
  const dueLines = getDueOwnerSummaries();

  backupNotice.classList.toggle("hidden", (!shouldShow && !dueLines.length) || !records.length);
  if (dueLines.length) {
    backupNotice.innerHTML = makeDueNoticeHtml(dueLines);
  } else if (shouldShow && records.length) {
    backupNotice.classList.remove("due-notice");
    backupNotice.textContent = lastBackup
      ? `마지막 백업 후 ${daysSinceBackup}일이 지났습니다. 백업을 저장해두면 안전합니다.`
      : "아직 백업한 기록이 없습니다. 백업 파일을 하나 만들어두면 안전합니다.";
  }
}

function renderBackupStatus() {
  if (!backupStatus) return;
  const lastBackup = localStorage.getItem(LAST_BACKUP_KEY);
  backupStatus.textContent = lastBackup ? `최근 백업: ${formatDate(lastBackup.slice(0, 10))}` : "최근 백업 기록이 없습니다.";
}

function renderDueNotice() {
  const dueLines = getDueOwnerSummaries();
  if (!dueLines.length || !records.length) return;
  backupNotice.classList.remove("hidden");
  backupNotice.innerHTML = makeDueNoticeHtml(dueLines);
}

function renderSummary() {
  const grouped = groupByOwner(records);
  const owners = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));

  summaryGrid.innerHTML = "";

  for (const owner of owners) {
    const ownerRecords = sortedRecords(grouped[owner]);
    const active = getActiveWithin180(ownerRecords);
    const nextDate = getEarliestNextDate(ownerRecords);
    const card = document.createElement("article");
    card.className = "summary-card";
    card.dataset.summaryOwner = owner;
    card.tabIndex = 0;
    card.innerHTML = `
      <div class="summary-title">
        <strong>${escapeHtml(owner)}</strong>
        <span>등록 ${ownerRecords.length}개 · 180일 내 ${active.length}개</span>
      </div>
      <div class="summary-meta">
        <div class="summary-date">
          <span>다음 신규회선 가능일</span>
          <b>${formatCompactDate(nextDate)} · ${formatDday(nextDate)}</b>
        </div>
      </div>
    `;
    summaryGrid.append(card);
  }
}

function renderTable() {
  const visibleRecords = getVisibleRecords();
  const grouped = groupByOwner(visibleRecords);
  const owners = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
  const recentIdsByOwner = getRecentIdMap(records);
  const earliestNextByOwner = getEarliestNextMap(records);

  tableBody.innerHTML = "";
  emptyState.style.display = records.length ? "none" : "flex";

  for (const owner of owners) {
    const ownerRecords = sortedRecords(grouped[owner]);
    const collapsed = collapsedOwners.has(owner);
    const header = document.createElement("tr");
    header.className = "owner-header";
    header.dataset.ownerSection = owner;
    header.innerHTML = `
      <td colspan="2">
        <button type="button" data-owner-toggle="${escapeHtml(owner)}" aria-label="${escapeHtml(owner)} ${collapsed ? "펼치기" : "접기"}" title="${collapsed ? "펼치기" : "접기"}">
          <span class="owner-toggle-icon" aria-hidden="true">${collapsed ? "▸" : "▾"}</span>
          <strong>${escapeHtml(owner)} <small>(${ownerRecords.length}개)</small></strong>
        </button>
      </td>
    `;
    tableBody.append(header);
    if (collapsed) continue;

    for (const record of ownerRecords) {
      const nextDate = addDays(record.openedAt, 181);
      const isRecent = recentIdsByOwner.get(record.owner)?.has(record.id);
      const isEarliestNext = earliestNextByOwner.get(record.owner) === nextDate;
      const row = document.createElement("tr");
      row.className = `line-row ${isRecent ? "recent" : "old"} ${record.status === "planned" ? "planned" : ""}`;
      row.innerHTML = `
        <td colspan="2">
          <div class="line-card">
            <div class="line-card-head">
              <div>
                <strong>${escapeHtml(record.owner)}</strong>
                <span>${escapeHtml(record.carrier)} · ${escapeHtml(record.phone)}</span>
              </div>
              <div class="row-button-group">
                <button class="edit-button" type="button" data-edit-id="${record.id}">수정</button>
                <button class="delete-button" type="button" data-delete-id="${record.id}">삭제</button>
              </div>
            </div>
            <div class="line-card-fields">
              <span class="line-field"><b>개통</b> <em>${formatTinyDate(record.openedAt)}</em></span>
              <span class="line-field ${isEarliestNext ? "next-soon" : ""}"><b>가능</b> <em>${formatTinyDate(nextDate)}</em></span>
              <span class="line-field"><b>상태</b> <em class="dday ${ddayClass(nextDate)}">${formatDday(nextDate)}</em></span>
            </div>
          </div>
        </td>
      `;
      tableBody.append(row);
    }
  }

  if (!visibleRecords.length && records.length) {
    emptyState.style.display = "flex";
    emptyState.querySelector("strong").textContent = "검색 결과가 없습니다.";
    emptyState.querySelector("span").textContent = "검색어나 명의자 필터를 바꿔보세요.";
  } else {
    emptyState.querySelector("strong").textContent = "아직 등록된 회선이 없습니다.";
    emptyState.querySelector("span").textContent =
      "명의자, 통신사, 신규날짜, 신규번호를 넣으면 다음 가능 날짜가 자동 계산됩니다.";
  }
}

function getVisibleRecords() {
  const filter = ownerFilter.value;

  return sortedRecords(records).filter((record) => {
    if (filter !== "all" && record.owner !== filter) return false;
    return true;
  });
}

function startEdit(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  editingId = id;
  ownerInput.value = record.owner;
  carrierInput.value = record.carrier;
  dateInput.value = record.openedAt;
  phoneInput.value = record.phone;
  submitButton.textContent = "수정 저장";
  cancelEditButton.classList.remove("hidden");
  updateDuplicateWarning();
  ownerInput.focus();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  editingId = null;
  form.reset();
  dateInput.value = todayInputDate();
  submitButton.textContent = "추가";
  cancelEditButton.classList.add("hidden");
  updateDuplicateWarning();
  ownerInput.focus();
}

function updateDuplicateWarning() {
  const duplicate = findDuplicate(phoneInput.value, editingId);
  duplicateWarning.classList.toggle("hidden", !duplicate);
  duplicateWarning.textContent = duplicate
    ? `${duplicate.owner} 명의에 같은 번호가 이미 등록되어 있습니다.`
    : "";
}

function findDuplicate(phone, exceptId) {
  const normalized = phone.replace(/\D/g, "");
  if (normalized.length < 8) return null;
  return records.find((record) => record.id !== exceptId && record.phone.replace(/\D/g, "") === normalized);
}

function toggleOwner(owner) {
  if (collapsedOwners.has(owner)) {
    collapsedOwners.delete(owner);
  } else {
    collapsedOwners.add(owner);
  }
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedOwners]));
  renderTable();
}

function getRecentIdMap(source) {
  const map = new Map();
  const grouped = groupByOwner(source.filter((record) => record.status !== "planned"));

  for (const [owner, ownerRecords] of Object.entries(grouped)) {
    map.set(owner, new Set(getRecentThree(ownerRecords).map((record) => record.id)));
  }

  return map;
}

function getEarliestNextMap(source) {
  const map = new Map();
  const grouped = groupByOwner(source.filter((record) => record.status !== "planned"));

  for (const [owner, ownerRecords] of Object.entries(grouped)) {
    const active = getActiveWithin180(ownerRecords);
    if (active.length < 3) continue;
    const earliest = active
      .map((record) => addDays(record.openedAt, 181))
      .sort((a, b) => dateValue(a) - dateValue(b))[0];
    map.set(owner, earliest);
  }

  return map;
}

function getEarliestNextDate(ownerRecords) {
  const active = getActiveWithin180(ownerRecords.filter((record) => record.status !== "planned"));
  if (active.length < 3) return todayInputDate();
  return active
    .map((record) => addDays(record.openedAt, 181))
    .sort((a, b) => dateValue(a) - dateValue(b))[0];
}

function getDueOwnerSummaries() {
  const grouped = groupByOwner(records);
  return Object.entries(grouped)
    .map(([owner, ownerRecords]) => {
      const nextDate = getEarliestNextDate(ownerRecords);
      const diff = Math.floor((dateValue(nextDate) - dateValue(todayInputDate())) / DAY_MS);
      return { owner, nextDate, diff };
    })
    .filter((item) => item.diff <= DUE_SOON_DAYS)
    .sort((a, b) => a.diff - b.diff || a.owner.localeCompare(b.owner, "ko", { numeric: true }));
}

function makeDueNoticeHtml(dueLines) {
  backupNotice.classList.add("due-notice");
  const ownerCards = dueLines
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.owner)}</strong>
          <span>
            <b>${formatDday(item.nextDate)}</b>
            <em>${formatCompactDate(item.nextDate)}</em>
          </span>
        </li>
      `,
    )
    .join("");

  return `
    <div class="notice-heading">
      <span aria-hidden="true">!</span>
      <div>
        <strong>신규회선 가능일이 다가왔습니다.</strong>
        <p>오늘 처리할 명의자를 한눈에 확인하세요.</p>
      </div>
    </div>
    <ul class="notice-list">${ownerCards}</ul>
  `;
}

function scrollToOwner(owner) {
  if (collapsedOwners.has(owner)) {
    collapsedOwners.delete(owner);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedOwners]));
    renderTable();
  }

  const ownerHeader = [...tableBody.querySelectorAll("[data-owner-section]")].find(
    (section) => section.dataset.ownerSection === owner,
  );
  ownerHeader?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getActiveWithin180(source) {
  const todayValue = dateValue(todayInputDate());
  return sortedRecords(source).filter((record) => {
    const ageInDays = Math.floor((todayValue - dateValue(record.openedAt)) / DAY_MS);
    return ageInDays >= 0 && ageInDays <= 180;
  });
}

function getRecentThree(source) {
  return sortedRecords(source).slice(-3);
}

function groupByOwner(source) {
  return source.reduce((groups, record) => {
    groups[record.owner] ||= [];
    groups[record.owner].push(record);
    return groups;
  }, {});
}

function sortedRecords(source) {
  return [...source].sort((a, b) => {
    const ownerDiff = a.owner.localeCompare(b.owner, "ko", { numeric: true });
    if (ownerDiff !== 0) return ownerDiff;

    const dateDiff = dateValue(a.openedAt) - dateValue(b.openedAt);
    if (dateDiff !== 0) return dateDiff;

    const carrierDiff = a.carrier.localeCompare(b.carrier, "ko", { numeric: true });
    if (carrierDiff !== 0) return carrierDiff;

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function normalizeBackupRecords(data) {
  const source = Array.isArray(data) ? data : data?.records;
  if (!Array.isArray(source)) return [];

  return source
    .map((record) => ({
      id: String(record.id || makeId()),
      owner: String(record.owner || "").trim(),
      carrier: String(record.carrier || "").trim(),
      openedAt: String(record.openedAt || "").trim(),
      phone: formatPhoneNumber(String(record.phone || "")),
      status: record.status === "planned" ? "planned" : "confirmed",
      memo: String(record.memo || "").trim(),
      createdAt: String(record.createdAt || new Date().toISOString()),
    }))
    .filter((record) => record.owner && record.carrier && isInputDate(record.openedAt) && record.phone);
}

function dedupeRecords(source) {
  const seen = new Set();
  const output = [];

  for (const record of source) {
    const key = `${record.owner}|${record.carrier}|${record.openedAt}|${record.phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(record);
  }

  return output;
}

function savePlainBackup() {
  const backup = makeBackupPayload();
  localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  downloadText(
    `신규회선체크_백업_${todayInputDate()}.json`,
    JSON.stringify(backup, null, 2),
    "application/json;charset=utf-8",
  );
  const originalText = backupButton.textContent;
  backupButton.textContent = "저장 완료";
  window.setTimeout(() => {
    backupButton.textContent = originalText;
  }, 1400);
  renderBackupStatus();
  renderBackupNotice();
}

function makeBackupPayload() {
  return {
    app: "telecom-line-checker",
    version: 2,
    exportedAt: new Date().toISOString(),
    records: sortedRecords(records),
  };
}

async function initPinLock() {
  if (!localStorage.getItem(PIN_KEY)) return;
  pinLock.classList.remove("hidden");
  pinUnlockInput.focus();
}

async function unlockWithPin() {
  const saved = localStorage.getItem(PIN_KEY);
  if (!saved) {
    pinLock.classList.add("hidden");
    return;
  }

  if ((await hashPin(pinUnlockInput.value)) === saved) {
    pinLock.classList.add("hidden");
    pinUnlockInput.value = "";
    pinMessage.textContent = "";
    return;
  }

  pinMessage.textContent = "PIN이 맞지 않습니다.";
}

async function hashPin(pin) {
  const input = `telecom-line-checker|${pin}`;
  if (crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return toBase64(new Uint8Array(digest));
  }

  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return String(hash);
}

function addDays(dateString, days) {
  const date = fromInputDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return toInputDate(date);
}

function dateValue(dateString) {
  return fromInputDate(dateString).getTime();
}

function fromInputDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function todayInputDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    timeZone: "UTC",
  }).format(fromInputDate(dateString));
}

function formatCompactDate(dateString) {
  const date = fromInputDate(dateString);
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}.${month}.${day}(${weekdays[date.getUTCDay()]})`;
}

function formatTinyDate(dateString) {
  return dateString.replaceAll("-", "");
}

function formatDday(dateString) {
  const diff = Math.floor((dateValue(dateString) - dateValue(todayInputDate())) / DAY_MS);
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "오늘 가능";
  return `${Math.abs(diff)}일 지남`;
}

function ddayClass(dateString) {
  const diff = Math.floor((dateValue(dateString) - dateValue(todayInputDate())) / DAY_MS);
  if (diff > 30) return "wait";
  if (diff > 0) return "soon";
  return "ready";
}

function statusLabel(status) {
  return status === "planned" ? "예정" : "확정";
}

function isInputDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(dateValue(value));
}

function loadRecords() {
  try {
    return normalizeBackupRecords(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
  } catch {
    return [];
  }
}

function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // 저장소가 막혀도 현재 화면에서는 계속 사용할 수 있게 둡니다.
  }
}

function loadCollapsedOwners() {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY)) || []);
  } catch {
    return new Set();
  }
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatPhoneNumber(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
