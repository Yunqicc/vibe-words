// 趣味背单词 MVP （SPA + localStorage）
// 视图：首页、学习、测试、结果、进度
// 数据：词库在前端（WORDS），状态与任务在 localStorage

(function () {
  const LS_KEYS = {
    wordStatus: 'wordStatus',
    dailyTask: 'dailyTask',
    stats: 'stats',
    completedDates: 'completedDates', // 用于计算学习天数
  };

  const STATUS = {
    familiar: 'familiar', // 认识
    vague: 'vague',       // 模糊
    unknown: 'unknown',   // 不会
  };

  // ---------- 工具 ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function daysBetween(dateStr) {
    if (!dateStr) return Infinity;
    const a = new Date(dateStr);
    const b = new Date(todayStr());
    const diff = Math.floor((b - a) / (1000 * 60 * 60 * 24));
    return diff;
  }
  function pickRandom(arr, count, excludeId) {
    const filtered = excludeId == null ? [...arr] : arr.filter(x => x.id !== excludeId);
    const result = [];
    const pool = [...filtered];
    while (result.length < count && pool.length > 0) {
      const idx = Math.floor(Math.random() * pool.length);
      result.push(pool.splice(idx, 1)[0]);
    }
    return result;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---------- 数据访问 ----------
  function getWordStatusMap() {
    // 使用 id 为 key，便于与 dailyTask 对齐
    return loadJSON(LS_KEYS.wordStatus, {});
  }
  function setWordStatus(id, status) {
    const map = getWordStatusMap();
    const now = todayStr();
    const existing = map[id] || { status: STATUS.vague, lastReview: now, reviewCount: 0 };
    map[id] = {
      status,
      lastReview: now,
      reviewCount: (existing.reviewCount || 0) + 1,
    };
    saveJSON(LS_KEYS.wordStatus, map);
  }
  function bumpFamiliarityOnCorrect(id) {
    const map = getWordStatusMap();
    const now = todayStr();
    const existing = map[id] || { status: STATUS.vague, lastReview: now, reviewCount: 0 };
    let newStatus = existing.status;
    if (existing.status === STATUS.unknown) newStatus = STATUS.vague;
    else if (existing.status === STATUS.vague) newStatus = STATUS.familiar;
    map[id] = { status: newStatus, lastReview: now, reviewCount: (existing.reviewCount || 0) + 1 };
    saveJSON(LS_KEYS.wordStatus, map);
  }
  function degradeOnWrong(id, wrongStreak) {
    const map = getWordStatusMap();
    const now = todayStr();
    const existing = map[id] || { status: STATUS.vague, lastReview: now, reviewCount: 0 };
    let newStatus = STATUS.vague;
    if (wrongStreak >= 2) newStatus = STATUS.unknown;
    map[id] = { status: newStatus, lastReview: now, reviewCount: existing.reviewCount };
    saveJSON(LS_KEYS.wordStatus, map);
  }

  // ---------- 每日任务生成（SRS 简化版） ----------
  function ensureDailyTask() {
    const existed = loadJSON(LS_KEYS.dailyTask, null);
    const today = todayStr();
    if (existed && existed.date === today) {
      return existed;
    }
    const status = getWordStatusMap();
    const knownIds = new Set(Object.keys(status).map(x => parseInt(x, 10)));
    const allIds = WORDS.map(w => w.id);
    const newCandidates = allIds.filter(id => !knownIds.has(id));
    const newWords = newCandidates.slice(0, 20);

    const reviewWords = [];
    // familiar → 3 天后复习；vague → 明天复习
    for (const [idStr, info] of Object.entries(status)) {
      const id = parseInt(idStr, 10);
      if (info.status === STATUS.familiar && daysBetween(info.lastReview) >= 3) {
        reviewWords.push(id);
      }
      if (info.status === STATUS.vague && daysBetween(info.lastReview) >= 1) {
        reviewWords.push(id);
      }
      // unknown 当天重复出现（最多 3 次）将由学习/测试流程内的队列控制，不纳入 reviewWords
    }

    const dailyTask = { date: today, newWords, reviewWords, completed: false };
    saveJSON(LS_KEYS.dailyTask, dailyTask);
    return dailyTask;
  }

  // ---------- 统计 ----------
  function computeStats() {
    const map = getWordStatusMap();
    let familiar = 0, vague = 0, unknown = 0;
    Object.values(map).forEach(info => {
      if (info.status === STATUS.familiar) familiar++;
      else if (info.status === STATUS.vague) vague++;
      else if (info.status === STATUS.unknown) unknown++;
    });
    const stats = loadJSON(LS_KEYS.stats, { totalLearned: 0, learnDays: 0, todayFinished: false });
    stats.totalLearned = familiar; // 以“认识”数作为掌握词数
    saveJSON(LS_KEYS.stats, stats);
    return { familiar, vague, unknown, stats };
  }
  function markTaskCompleted() {
    const task = ensureDailyTask();
    task.completed = true;
    saveJSON(LS_KEYS.dailyTask, task);

    const stats = loadJSON(LS_KEYS.stats, { totalLearned: 0, learnDays: 0, todayFinished: false });
    stats.todayFinished = true;
    saveJSON(LS_KEYS.stats, stats);

    const dates = new Set(loadJSON(LS_KEYS.completedDates, []));
    dates.add(todayStr());
    saveJSON(LS_KEYS.completedDates, Array.from(dates));
    // 更新学习天数
    const learnDays = Array.from(dates).length;
    stats.learnDays = learnDays;
    saveJSON(LS_KEYS.stats, stats);
  }

  // ---------- 视图与路由 ----------
  const views = {
    home: document.getElementById('view-home'),
    learn: document.getElementById('view-learn'),
    test: document.getElementById('view-test'),
    result: document.getElementById('view-result'),
    progress: document.getElementById('view-progress'),
  };
  function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[name]?.classList.remove('hidden');
    location.hash = `#${name}`;
  }

  // 首页渲染
  function renderHome() {
    const task = ensureDailyTask();
    document.getElementById('metric-new').textContent = String(task.newWords.length);
    document.getElementById('metric-review').textContent = String(task.reviewWords.length);
    showView('home');
  }

  // 学习页逻辑
  const learnState = {
    list: [],
    index: 0,
    unknownQueue: {}, // id -> 次数
    front: true,
  };
  function setupLearnList() {
    const task = ensureDailyTask();
    learnState.list = [...task.newWords]; // 仅对新词进行卡片学习
    learnState.index = 0;
    learnState.unknownQueue = {};
    learnState.front = true;
    updateLearnProgress();
  }
  function updateLearnProgress() {
    const total = learnState.list.length;
    const current = Math.min(learnState.index + 1, Math.max(total, 1));
    document.getElementById('learn-progress-text').textContent = `${current} / ${total}`;
    document.getElementById('learn-progress-bar').style.width = `${Math.round((current / Math.max(total, 1)) * 100)}%`;
  }
  function currentWord() {
    const id = learnState.list[learnState.index];
    return WORDS.find(w => w.id === id) || WORDS[0];
  }
  function renderFlashcard() {
    const w = currentWord();
    document.getElementById('card-word').textContent = w.word;
    document.getElementById('card-phonetic').textContent = w.phonetic || '';
    document.getElementById('card-example').textContent = w.example || '';
    document.getElementById('card-definition').textContent = w.definition || '';
    document.getElementById('card-pos').textContent = ''; // 简化不区分具体词性字段
    document.getElementById('card-mnemonic').textContent = w.mnemonic ? `💡 ${w.mnemonic}` : ' ';
    // 面显示
    const front = document.getElementById('card-front');
    const back = document.getElementById('card-back');
    if (learnState.front) { front.classList.remove('hidden'); back.classList.add('hidden'); }
    else { back.classList.remove('hidden'); front.classList.add('hidden'); }
    updateLearnProgress();
  }
  function goPrev() {
    learnState.index = Math.max(0, learnState.index - 1);
    learnState.front = true;
    renderFlashcard();
  }
  function goNext() {
    learnState.index = Math.min(learnState.list.length - 1, learnState.index + 1);
    learnState.front = true;
    renderFlashcard();
  }
  function markStatus(status) {
    const w = currentWord();
    setWordStatus(w.id, status);
    if (status === STATUS.unknown) {
      const times = learnState.unknownQueue[w.id] || 0;
      if (times < 3) {
        learnState.unknownQueue[w.id] = times + 1;
        // 插入到后续队列中，促进当天重复
        learnState.list.push(w.id);
      }
    }
    goNext();
  }
  function renderLearn() {
    setupLearnList();
    renderFlashcard();
    showView('learn');
  }

  // 测试页逻辑
  const testState = {
    questions: [],
    index: 0,
    wrongStreak: {}, // id -> 连续错误次数
  };
  function buildQuestions() {
    const task = ensureDailyTask();
    const poolIds = [...task.newWords, ...task.reviewWords];
    const pool = WORDS.filter(w => poolIds.includes(w.id));
    testState.questions = pool.map(w => {
      const distractors = pickRandom(WORDS, 3, w.id).map(x => ({ id: x.id, text: x.definition }));
      const choices = shuffle([
        { id: w.id, text: w.definition, correct: true },
        ...distractors.map(d => ({ id: d.id, text: d.text, correct: false }))
      ]);
      return { word: w, choices };
    });
    testState.index = 0;
    testState.wrongStreak = {};
  }
  function renderQuestion() {
    const total = testState.questions.length;
    const current = Math.min(testState.index + 1, Math.max(total, 1));
    document.getElementById('test-progress-text').textContent = `${current} / ${total}`;
    document.getElementById('test-progress-bar').style.width = `${Math.round((current / Math.max(total, 1)) * 100)}%`;
    const q = testState.questions[testState.index];
    document.getElementById('test-question-word').textContent = q.word.word;
    const ul = document.getElementById('test-choices');
    ul.innerHTML = '';
    q.choices.forEach((c, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = `${['A','B','C','D'][i]}、 ${c.text}`;
      btn.addEventListener('click', () => onChoose(c));
      li.appendChild(btn);
      ul.appendChild(li);
    });
    document.getElementById('test-feedback').textContent = '';
  }
  function onChoose(choice) {
    const q = testState.questions[testState.index];
    const feedback = document.getElementById('test-feedback');
    if (choice.correct) {
      feedback.textContent = '✅ 正确！熟悉度 +1';
      bumpFamiliarityOnCorrect(q.word.id);
      testState.wrongStreak[q.word.id] = 0;
    } else {
      const streak = (testState.wrongStreak[q.word.id] || 0) + 1;
      testState.wrongStreak[q.word.id] = streak;
      degradeOnWrong(q.word.id, streak);
      feedback.textContent = streak >= 2 ? '❌ 连续错 2 次 → 不会' : '❌ 错误 → 状态降为 模糊';
      // 将该题再次插入末尾，促进当天重复（最多一次）
      if (streak <= 2) {
        testState.questions.push(q);
      }
    }
  }
  function nextQuestion() {
    if (testState.index < testState.questions.length - 1) {
      testState.index++;
      renderQuestion();
    } else {
      // 测试结束
      markTaskCompleted();
      renderResult();
    }
  }
  function renderTest() {
    buildQuestions();
    renderQuestion();
    showView('test');
  }

  // 结果页
  function renderResult() {
    const { familiar, vague, unknown, stats } = computeStats();
    const summary = `掌握：${familiar}，模糊：${vague}，不会：${unknown}；累计学习天数：${stats.learnDays}`;
    document.getElementById('result-summary').textContent = summary;
    showView('result');
  }

  // 进度页
  function renderProgress() {
    const { familiar, vague, unknown, stats } = computeStats();
    document.getElementById('stat-familiar').textContent = String(familiar);
    document.getElementById('stat-vague').textContent = String(vague);
    document.getElementById('stat-unknown').textContent = String(unknown);
    document.getElementById('stat-days').textContent = `累计学习天数：${stats.learnDays || 0}`;
    document.getElementById('stat-today').textContent = `今日任务完成：${stats.todayFinished ? '是' : '否'}`;
    drawBarChart('progress-chart', [{ label: '认识', value: familiar, color: '#10b981' }, { label: '模糊', value: vague, color: '#f59e0b' }, { label: '不会', value: unknown, color: '#ef4444' }]);
    showView('progress');
  }
  function drawBarChart(canvasId, series) {
    const c = document.getElementById(canvasId);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const max = Math.max(1, ...series.map(s => s.value));
    const barWidth = 80;
    const gap = 24;
    series.forEach((s, i) => {
      const x = 40 + i * (barWidth + gap);
      const h = Math.round((s.value / max) * (c.height - 60));
      const y = c.height - 40 - h;
      ctx.fillStyle = s.color;
      ctx.fillRect(x, y, barWidth, h);
      ctx.fillStyle = '#9ca3af';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, x + barWidth / 2, c.height - 20);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillText(String(s.value), x + barWidth / 2, y - 6);
    });
  }

  // 路由
  function route() {
    const hash = (location.hash || '#home').replace('#', '');
    switch (hash) {
      case 'home': renderHome(); break;
      case 'learn': renderLearn(); break;
      case 'test': renderTest(); break;
      case 'result': renderResult(); break;
      case 'progress': renderProgress(); break;
      default: renderHome(); break;
    }
  }

  // 事件绑定
  function bindEvents() {
    document.getElementById('btn-start-learn').addEventListener('click', () => renderLearn());
    document.getElementById('btn-start-test').addEventListener('click', () => renderTest());
    document.getElementById('btn-view-progress').addEventListener('click', () => renderProgress());

    document.getElementById('btn-flip').addEventListener('click', () => { learnState.front = !learnState.front; renderFlashcard(); });
    document.getElementById('btn-familiar').addEventListener('click', () => markStatus(STATUS.familiar));
    document.getElementById('btn-vague').addEventListener('click', () => markStatus(STATUS.vague));
    document.getElementById('btn-unknown').addEventListener('click', () => markStatus(STATUS.unknown));
    document.getElementById('btn-learn-prev').addEventListener('click', () => goPrev());
    document.getElementById('btn-learn-next').addEventListener('click', () => goNext());
    document.getElementById('btn-learn-finish').addEventListener('click', () => renderTest());

    document.getElementById('btn-next-question').addEventListener('click', () => nextQuestion());
    document.getElementById('btn-back-home').addEventListener('click', () => renderHome());
  }

  // 初始化
  function init() {
    ensureDailyTask();
    bindEvents();
    window.addEventListener('hashchange', route);
    route();
  }

  init();
})();
