import { LocalNotifications } from '@capacitor/local-notifications';

/* ===================== الإعدادات القابلة للتعديل ===================== */
const ICONS = {
  dumbbell: '🏋️', book: '📚', briefcase: '💼', sparkles: '✨',
  brain: '🧠', heart: '❤️', music: '🎵', code: '💻', paint: '🎨', sun: '☀️'
};

const DEFAULT_QUESTS = [
  { id: 'q1', name: 'تمرين صباحي', xp: 20, icon: 'dumbbell' },
  { id: 'q2', name: 'قراءة 30 دقيقة', xp: 15, icon: 'book' },
  { id: 'q3', name: 'شغل إضافي', xp: 30, icon: 'briefcase' }
];

const FOCUS_MINUTES = 25;
const FOCUS_XP = 25;

// بعد كم دقيقة من عدم فتح التطبيق يوصل التذكير
const REMINDER_MINUTES = 60;
const REMINDER_ID = 1;

function xpForLevel(level){ return 100 + (level - 1) * 40; }
/* ====================================================================== */

const STORAGE_KEY = 'lifeRpgState';
const OPENS_KEY = 'lifeRpgOpens';

function uid(){ return Math.random().toString(36).slice(2, 10); }

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return { level: 1, xp: 0, log: [], quests: DEFAULT_QUESTS };
}

function saveState(){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch(e) {}
}

let state = loadState();
let focusTimer = null;
let focusSecondsLeft = FOCUS_MINUTES * 60;
let focusRunning = false;

/* ---------- تنبيه الاستخدام المتكرر بدون إنجاز (داخل التطبيق) ---------- */
function checkDistractionNudge(){
  let opens = [];
  try { opens = JSON.parse(localStorage.getItem(OPENS_KEY) || '[]'); } catch(e) {}
  const now = Date.now();
  const twentyMinAgo = now - 20 * 60 * 1000;
  opens = opens.filter(t => t > twentyMinAgo);
  opens.push(now);
  localStorage.setItem(OPENS_KEY, JSON.stringify(opens));

  const lastLogTs = state.log[0] ? state.log[0].ts : 0;
  const completedRecently = lastLogTs > twentyMinAgo;

  if (opens.length >= 4 && !completedRecently) {
    document.getElementById('nudgeBanner').classList.add('show');
  }
}

function clearOpensAfterCompletion(){
  localStorage.setItem(OPENS_KEY, JSON.stringify([]));
  document.getElementById('nudgeBanner').classList.remove('show');
}

/* ---------- تذكير أندرويد الحقيقي (يشتغل حتى لو التطبيق مسكر) ---------- */
async function scheduleHourlyReminder(){
  try {
    const perm = await LocalNotifications.checkPermissions();
    let display = perm.display;
    if (display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      display = req.display;
    }
    if (display !== 'granted') return;

    await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
    await LocalNotifications.schedule({
      notifications: [{
        id: REMINDER_ID,
        title: 'Life RPG',
        body: 'مر ساعة من آخر مرة سجلت فيها إنجاز — رجع تفقد مهامك؟',
        schedule: { at: new Date(Date.now() + REMINDER_MINUTES * 60 * 1000) }
      }]
    });
  } catch (e) {
    // مو شغال (مثلاً معاينة على متصفح عادي بدل التطبيق المُثبّت) - تجاهل
  }
}

/* ---------- رسم الحلقة والليفل ---------- */
function render(){
  const need = xpForLevel(state.level);
  const pct = Math.min(100, Math.round((state.xp / need) * 100));
  const r = 54, c = 2 * Math.PI * r;
  const dash = c * (pct / 100);

  document.getElementById('ringProgress').setAttribute('stroke-dasharray', `${dash} ${c}`);
  document.getElementById('levelNum').textContent = state.level;
  document.getElementById('xpText').innerHTML = `<span dir="ltr" style="unicode-bidi:isolate;">${state.xp} / ${need} XP</span>`;
  document.getElementById('completedCount').textContent = `${state.log.length} مهمة`;

  renderQuests();
  renderLog();
}

function renderQuests(){
  const list = document.getElementById('questList');
  if (state.quests.length === 0) {
    list.innerHTML = `<div class="card empty">دفتر المهام فاضي، أضف أول مهمة وابدأ تكسب خبرة</div>`;
    return;
  }
  list.innerHTML = state.quests.map(q => `
    <div class="card quest">
      <div class="quest-left">
        <div class="quest-icon">${ICONS[q.icon] || '✨'}</div>
        <div>
          <div class="quest-name">${escapeHtml(q.name)}</div>
          <div class="quest-xp pixel">+${q.xp} XP</div>
        </div>
      </div>
      <div class="quest-actions">
        <button class="icon-btn btn-check" onclick="completeQuest('${q.id}')" aria-label="إنجاز">✓</button>
        <button class="icon-btn btn-trash" onclick="deleteQuest('${q.id}')" aria-label="حذف">🗑</button>
      </div>
    </div>
  `).join('');
}

function renderLog(){
  const section = document.getElementById('logSection');
  const list = document.getElementById('logList');
  if (state.log.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = state.log.slice(0, 8).map(entry => {
    const d = new Date(entry.ts);
    const time = d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="log-row">
        <div class="log-left"><span>${ICONS[entry.icon] || '✨'}</span><span>${escapeHtml(entry.name)}</span></div>
        <div><span class="log-xp pixel">+${entry.xp}</span><span class="log-time">${time}</span></div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ---------- إكمال مهمة ---------- */
window.completeQuest = function(id){
  const quest = state.quests.find(q => q.id === id);
  if (!quest) return;

  let curLevel = state.level;
  let curXp = state.xp + quest.xp;
  let leveled = false;
  while (curXp >= xpForLevel(curLevel)) {
    curXp -= xpForLevel(curLevel);
    curLevel += 1;
    leveled = true;
  }

  state.level = curLevel;
  state.xp = curXp;
  state.log.unshift({ id: uid(), name: quest.name, xp: quest.xp, icon: quest.icon, ts: Date.now() });
  state.log = state.log.slice(0, 30);
  saveState();
  render();
  clearOpensAfterCompletion();

  if (leveled) showLevelUp(curLevel);
};

window.deleteQuest = function(id){
  state.quests = state.quests.filter(q => q.id !== id);
  saveState();
  render();
};

/* ---------- إضافة مهمة ---------- */
let selectedIcon = 'sparkles';

function buildIconGrid(){
  const grid = document.getElementById('iconGrid');
  grid.innerHTML = Object.keys(ICONS).map(k => `
    <button type="button" class="icon-pick ${k === selectedIcon ? 'active' : ''}" data-icon="${k}">${ICONS[k]}</button>
  `).join('');
  grid.querySelectorAll('.icon-pick').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedIcon = btn.dataset.icon;
      buildIconGrid();
    });
  });
}

document.getElementById('openAddBtn').addEventListener('click', () => {
  document.getElementById('addOverlay').classList.add('show');
  buildIconGrid();
});
document.getElementById('closeAddBtn').addEventListener('click', () => {
  document.getElementById('addOverlay').classList.remove('show');
});
document.getElementById('addOverlay').addEventListener('click', () => {
  document.getElementById('addOverlay').classList.remove('show');
});
document.getElementById('saveQuestBtn').addEventListener('click', () => {
  const nameInput = document.getElementById('questNameInput');
  const xpInput = document.getElementById('questXpInput');
  const name = nameInput.value.trim();
  if (!name) return;
  const xp = Math.max(1, Math.min(999, Number(xpInput.value) || 1));
  state.quests.unshift({ id: uid(), name, xp, icon: selectedIcon });
  saveState();
  render();
  nameInput.value = ''; xpInput.value = 10; selectedIcon = 'sparkles';
  document.getElementById('addOverlay').classList.remove('show');
});

/* ---------- ليفل أب ---------- */
function showLevelUp(level){
  document.getElementById('levelUpNum').textContent = level;
  const overlay = document.getElementById('levelUpOverlay');
  overlay.classList.add('show');
  setTimeout(() => overlay.classList.remove('show'), 2200);
}
document.getElementById('levelUpOverlay').addEventListener('click', () => {
  document.getElementById('levelUpOverlay').classList.remove('show');
});

/* ---------- وضع التركيز (بومودورو) ---------- */
function formatTime(sec){
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

document.getElementById('focusBtn').addEventListener('click', () => {
  if (focusRunning) {
    stopFocus(false);
    return;
  }
  focusRunning = true;
  focusSecondsLeft = FOCUS_MINUTES * 60;
  document.getElementById('focusBtn').textContent = 'إيقاف الجلسة';
  focusTimer = setInterval(() => {
    focusSecondsLeft -= 1;
    document.getElementById('focusTime').textContent = formatTime(focusSecondsLeft);
    if (focusSecondsLeft <= 0) stopFocus(true);
  }, 1000);
});

function stopFocus(completed){
  clearInterval(focusTimer);
  focusRunning = false;
  document.getElementById('focusBtn').textContent = `ابدأ جلسة تركيز (+${FOCUS_XP} XP)`;
  document.getElementById('focusTime').textContent = formatTime(FOCUS_MINUTES * 60);
  focusSecondsLeft = FOCUS_MINUTES * 60;

  if (completed) {
    let curLevel = state.level;
    let curXp = state.xp + FOCUS_XP;
    let leveled = false;
    while (curXp >= xpForLevel(curLevel)) {
      curXp -= xpForLevel(curLevel);
      curLevel += 1;
      leveled = true;
    }
    state.level = curLevel;
    state.xp = curXp;
    state.log.unshift({ id: uid(), name: `جلسة تركيز ${FOCUS_MINUTES} دقيقة`, xp: FOCUS_XP, icon: 'brain', ts: Date.now() });
    state.log = state.log.slice(0, 30);
    saveState();
    render();
    clearOpensAfterCompletion();
    if (leveled) showLevelUp(curLevel);
  }
}

/* ---------- بدء التشغيل ---------- */
render();
checkDistractionNudge();
scheduleHourlyReminder();
