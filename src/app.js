import { LocalNotifications } from '@capacitor/local-notifications';

/* ===================== الإعدادات القابلة للتعديل ===================== */
const ICONS = {
  dumbbell: '🏋️', book: '📚', briefcase: '💼', sparkles: '✨',
  brain: '🧠', heart: '❤️', music: '🎵', code: '💻', paint: '🎨', sun: '☀️'
};

// اسم الـStat المرتبط بكل أيقونة - يظهر تلقائياً أول ما تُستخدم الأيقونة بمهمة
const STAT_LABELS = {
  dumbbell: 'قوة', book: 'ذكاء', briefcase: 'انضباط', sparkles: 'روح',
  brain: 'تركيز', heart: 'صحة', music: 'إبداع', code: 'تقنية', paint: 'فن', sun: 'طاقة'
};

const DEFAULT_QUESTS = [
  { id: 'q1', name: 'تمرين صباحي', xp: 20, icon: 'dumbbell' },
  { id: 'q2', name: 'قراءة 30 دقيقة', xp: 15, icon: 'book' },
  { id: 'q3', name: 'شغل إضافي', xp: 30, icon: 'briefcase' }
];

// بنك المهام البديلة - تستخدم عند الضغط على زر التبديل 🔄
const ALTERNATIVE_QUESTS = [
  { name: 'شرب مي كفاية', xp: 10, icon: 'heart' },
  { name: 'نوم بدري', xp: 15, icon: 'sun' },
  { name: 'ترتيب المكان', xp: 15, icon: 'briefcase' },
  { name: 'تواصل مع صديق أو عائلة', xp: 10, icon: 'heart' },
  { name: 'تعلم شي جديد', xp: 20, icon: 'brain' },
  { name: 'مشي 20 دقيقة', xp: 15, icon: 'dumbbell' },
  { name: 'كتابة يوميات', xp: 10, icon: 'paint' },
  { name: 'تمرين تنفس أو تأمل', xp: 10, icon: 'brain' },
  { name: 'طبخ وجبة صحية', xp: 15, icon: 'heart' },
  { name: 'مراجعة أهداف الأسبوع', xp: 15, icon: 'briefcase' }
];

const FOCUS_MINUTES = 25;
const FOCUS_XP = 25;

// بعد كم دقيقة من عدم فتح التطبيق يوصل التذكير
const REMINDER_MINUTES = 60;
const REMINDER_ID = 1;

function xpForLevel(level){ return 40 + (level - 1) * 30; }
/* ====================================================================== */

const STORAGE_KEY = 'lifeRpgState';
const OPENS_KEY = 'lifeRpgOpens';

function uid(){ return Math.random().toString(36).slice(2, 10); }

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.streak === undefined) parsed.streak = 0;
      if (parsed.lastActiveDate === undefined) parsed.lastActiveDate = null;
      if (parsed.graceMonthKey === undefined) parsed.graceMonthKey = null;
      if (parsed.graceUsesThisMonth === undefined) parsed.graceUsesThisMonth = 0;
      if (parsed.dailyCompletions === undefined) parsed.dailyCompletions = { date: null, ids: [] };
      if (parsed.stats === undefined) parsed.stats = {};
      if (parsed.history === undefined) parsed.history = {};
      if (parsed.flexibleQuestId === undefined) parsed.flexibleQuestId = null;
      if (parsed.swapUsed === undefined) parsed.swapUsed = { date: null, used: false };
      return parsed;
    }
  } catch(e) {}
  return { level: 1, xp: 0, log: [], quests: DEFAULT_QUESTS, streak: 0, lastActiveDate: null, graceMonthKey: null, graceUsesThisMonth: 0, dailyCompletions: { date: null, ids: [] }, stats: {}, history: {}, flexibleQuestId: null, swapUsed: { date: null, used: false } };
}

/* ---------- سلسلة الأيام (Streak) ---------- */
// أقصى عدد "أيام سماح" (تفويت يوم وحد بدون كسر السلسلة) مسموح بالشهر
const MAX_GRACE_PER_MONTH = 2;

function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function daysBetween(a, b){
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

/* ---------- تجدد المهام يومياً ---------- */
function resetDailyIfNeeded(){
  const today = todayStr();
  if (state.dailyCompletions.date !== today) {
    state.dailyCompletions = { date: today, ids: [] };
  }
  if (state.swapUsed.date !== today) {
    state.swapUsed = { date: today, used: false };
  }
}

/* ---------- الإحصائيات (Stats) - تلقائية حسب أيقونة المهمة ---------- */
function awardStatXp(iconKey, amount){
  if (!STAT_LABELS[iconKey]) return; // أيقونة غير معروفة، تجاهل
  if (!state.stats[iconKey]) state.stats[iconKey] = { xp: 0, level: 1 };
  const s = state.stats[iconKey];
  s.xp += amount;
  while (s.xp >= xpForLevel(s.level)) {
    s.xp -= xpForLevel(s.level);
    s.level += 1;
  }
}

function renderStats(){
  const section = document.getElementById('statsSection');
  const list = document.getElementById('statsList');
  const keys = Object.keys(state.stats);
  if (keys.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  list.innerHTML = keys.map(k => {
    const s = state.stats[k];
    const need = xpForLevel(s.level);
    const pct = Math.min(100, Math.round((s.xp / need) * 100));
    return `
      <div class="stat-card">
        <div class="stat-top">
          <span>${ICONS[k] || '✨'} ${STAT_LABELS[k] || 'عام'}</span>
          <span class="pixel" style="font-size:10px; color:var(--gold);">LV ${s.level}</span>
        </div>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%;"></div></div>
      </div>
    `;
  }).join('');
}

/* ---------- سجل آخر ١٤ يوم ---------- */
function recordHistory(){
  const t = todayStr();
  state.history[t] = (state.history[t] || 0) + 1;
}

function renderHistory(){
  const container = document.getElementById('historyList');
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    days.push({ dayNum: d.getDate(), active: !!state.history[key] });
  }
  container.innerHTML = days.map(d => `
    <div style="display:flex; flex-direction:column; align-items:center; gap:4px; flex-shrink:0;">
      <div style="width:20px; height:20px; border-radius:6px; background:${d.active ? 'var(--teal)' : 'var(--border)'};"></div>
      <div style="font-size:9px; color:var(--muted2);">${d.dayNum}</div>
    </div>
  `).join('');
}

function updateStreak(){
  const today = todayStr();
  const curMonth = today.slice(0, 7);
  if (state.graceMonthKey !== curMonth) {
    state.graceMonthKey = curMonth;
    state.graceUsesThisMonth = 0;
  }

  if (!state.lastActiveDate) {
    state.streak = 1;
    state.lastActiveDate = today;
    return;
  }
  if (state.lastActiveDate === today) return; // اليوم محسوب أصلاً

  const gap = daysBetween(state.lastActiveDate, today);
  if (gap === 1) {
    state.streak += 1;
  } else if (gap === 2 && state.graceUsesThisMonth < MAX_GRACE_PER_MONTH) {
    state.graceUsesThisMonth += 1; // استخدام يوم سماح، السلسلة بتضل متل ما هي
  } else {
    state.streak = 1;
  }
  state.lastActiveDate = today;
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
  resetDailyIfNeeded();
  const need = xpForLevel(state.level);
  const pct = Math.min(100, Math.round((state.xp / need) * 100));
  const r = 54, c = 2 * Math.PI * r;
  const dash = c * (pct / 100);

  document.getElementById('ringProgress').setAttribute('stroke-dasharray', `${dash} ${c}`);
  document.getElementById('levelNum').textContent = state.level;
  document.getElementById('xpText').innerHTML = `<span dir="ltr" style="unicode-bidi:isolate;">${state.xp} / ${need} XP</span>`;
  document.getElementById('completedCount').textContent = `${state.log.length} مهمة`;

  const streakEl = document.getElementById('streakBadge');
  if (state.streak > 0) {
    streakEl.style.display = 'inline-flex';
    const remaining = Math.max(0, MAX_GRACE_PER_MONTH - state.graceUsesThisMonth);
    streakEl.textContent = `🔥 ${state.streak} يوم متتالي (تبقى ${remaining} من ${MAX_GRACE_PER_MONTH} أيام سماح هالشهر)`;
  } else {
    streakEl.style.display = 'none';
  }

  renderQuests();
  renderLog();
  renderStats();
  renderHistory();
}

function renderQuests(){
  const list = document.getElementById('questList');
  if (state.quests.length === 0) {
    list.innerHTML = `<div class="card empty">ما إلك مهام مفعّلة اليوم — كل مهامك موجودة أدناه</div>`;
    return;
  }
  list.innerHTML = state.quests.map(q => {
    const doneToday = state.dailyCompletions.ids.includes(q.id);
    const swapDisabled = state.swapUsed.used;
    return `
    <div class="card quest ${doneToday ? 'quest-done' : ''}">
      <div class="quest-left">
        <div class="quest-icon">${ICONS[q.icon] || '✨'}</div>
        <div>
          <div class="quest-name">${escapeHtml(q.name)}</div>
          <div class="quest-xp pixel">+${q.xp} XP</div>
        </div>
      </div>
      <div class="quest-actions">
        ${doneToday
          ? `<span class="done-check">✔</span>`
          : `<button class="icon-btn btn-check" onclick="completeQuest('${q.id}')" aria-label="إنجاز">✓</button>`}
        <button class="icon-btn btn-swap" ${swapDisabled ? 'disabled style="opacity:0.35;"' : `onclick="swapQuest('${q.id}')"`} aria-label="تبديل">🔄</button>
        <button class="icon-btn btn-trash" onclick="deleteQuest('${q.id}')" aria-label="حذف">🗑</button>
      </div>
    </div>
  `;
  }).join('');
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
  resetDailyIfNeeded();
  if (state.dailyCompletions.ids.includes(id)) return; // اتعملت اليوم أصلاً

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
  state.dailyCompletions.ids.push(id);
  awardStatXp(quest.icon, quest.xp);
  updateStreak();
  recordHistory();
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

window.swapQuest = function(id){
  if (state.swapUsed.used) return; // استُخدم التبديل اليوم أصلاً
  const current = state.quests.find(q => q.id === id);
  if (!current) return;
  const usedNames = state.quests.map(q => q.name);
  const options = ALTERNATIVE_QUESTS.filter(a => !usedNames.includes(a.name));
  if (options.length === 0) return; // ما تبقى بدائل جديدة
  const pick = options[Math.floor(Math.random() * options.length)];
  current.name = pick.name;
  current.xp = pick.xp;
  current.icon = pick.icon;
  state.dailyCompletions.ids = state.dailyCompletions.ids.filter(qid => qid !== id); // صارت مهمة مختلفة
  state.swapUsed = { date: todayStr(), used: true };
  saveState();
  render();
};

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
    awardStatXp('brain', FOCUS_XP);
    updateStreak();
    recordHistory();
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
