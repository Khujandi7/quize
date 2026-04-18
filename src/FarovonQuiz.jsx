import React, { useState, useEffect, useRef } from 'react';

// ============================================
// FAROVON QUIZ v4 — Premium Dark Design
// Unbounded + Onest fonts, glow effects
// ============================================

const COLORS = {
  bg: '#09090F',
  surface: '#11111C',
  surface2: '#18182A',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.45)',
  accent: '#A89FFF',
  brand: '#5B4BEA',
  brandLight: '#7B6EFF',
  brandDark: '#3D2FD4',
  glow: 'rgba(91,75,234,0.35)',
  green: '#22D3A0',
  red: '#FF4F6A',
  amber: '#FFB547',
};

const ANSWER_COLORS = ['#E84040', '#1E7FD8', '#E8A020', '#1EA878'];
const ANSWER_GLOWS = [
  'rgba(232,64,64,0.35)',
  'rgba(30,127,216,0.35)',
  'rgba(232,160,32,0.35)',
  'rgba(30,168,120,0.35)',
];
const ANSWER_LABELS = ['A', 'B', 'C', 'D'];

const DEFAULT_QUESTIONS = [
  {
    id: 1, type: 'quiz',
    q: 'Какая технология лежит в основе современных нейросетей типа GPT?',
    options: ['Рекуррентные сети (RNN)', 'Трансформеры (Transformers)', 'Свёрточные сети (CNN)', 'Деревья решений'],
    correct: 1, time: 20, points: 'standard',
  },
  {
    id: 2, type: 'quiz',
    q: 'Что такое Vibe Coding?',
    options: ['Стиль оформления кода', 'Программирование через диалог с AI', 'Новый язык программирования', 'Метод отладки'],
    correct: 1, time: 20, points: 'standard',
  },
  {
    id: 3, type: 'quiz',
    q: 'Какой сервис Google подходит для автоматизации без своего сервера?',
    options: ['Google Slides', 'Apps Script', 'Google Meet', 'Google Keep'],
    correct: 1, time: 15, points: 'standard',
  },
];

const NAMES_POOL = [
  'Фарход', 'Нигина', 'Рустам', 'Зарина', 'Бахтиёр', 'Мохира',
  'Умед', 'Шахноза', 'Далер', 'Саида', 'Комрон', 'Лола', 'Искандар',
  'Мадина', 'Темур', 'Нилуфар',
];

// ============================================
// SHARED GAME STATE
// ============================================
const gameState = {
  phase: 'idle',
  players: [],
  qIdx: 0,
  timeLeft: 0,
  answers: {},
  hostActive: false,
  paused: false,
  questionStartTime: 0,
  currentQuestion: null,
  questions: DEFAULT_QUESTIONS,
  settings: null,
  listeners: new Set(),

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { this.listeners.forEach(fn => fn()); },

  reset() {
    this.phase = 'idle'; this.players = []; this.qIdx = 0;
    this.answers = {}; this.hostActive = false; this.paused = false;
    this.currentQuestion = null; this.emit();
  },

  activateHost(questions, settings) {
    this.questions = questions; this.settings = settings;
    this.hostActive = true; this.phase = 'lobby';
    this.players = []; this.answers = {}; this.paused = false; this.emit();
  },

  addPlayer(name) {
    const trimmed = name.trim();
    if (this.players.find(p => p.name.toLowerCase() === trimmed.toLowerCase()))
      return { error: 'Этот ник уже занят.' };
    if (this.players.length >= 100) return { error: 'Достигнут максимум — 100 участников.' };
    if (this.phase !== 'lobby') return { error: 'Игра уже началась.' };
    const player = { id: Date.now() + Math.random(), name: trimmed, score: 0, streak: 0, lastDelta: 0 };
    this.players.push(player); this.emit();
    return { player };
  },

  kickPlayer(id) { this.players = this.players.filter(p => p.id !== id); this.emit(); },

  submitAnswer(playerId, choice) {
    if (this.phase !== 'question' || this.paused || this.answers[playerId]) return;
    const time = (Date.now() - this.questionStartTime) / 1000;
    this.answers[playerId] = { choice, time }; this.emit();
  },

  startGame() { this.phase = 'countdown'; this.emit(); },

  loadQuestion(idx) {
    const q = this.questions[idx];
    this.qIdx = idx; this.currentQuestion = q; this.timeLeft = q.time;
    this.answers = {}; this.questionStartTime = Date.now();
    this.phase = 'question'; this.paused = false; this.emit();
  },

  revealAnswers() { this.phase = 'reveal'; this.emit(); },

  calcScoresAndShowLeaderboard() {
    const q = this.currentQuestion; const s = this.settings;
    this.players = this.players.map(p => {
      const a = this.answers[p.id];
      if (!a) return { ...p, streak: 0, lastDelta: 0 };
      if (a.choice === q.correct) {
        const base = q.points === 'double' ? 1000 : q.points === 'none' ? 0 : 500;
        const speedBonus = s.speedBonus ? Math.round(1000 * (1 - a.time / q.time)) : 0;
        const streakBonus = s.streakBonus ? p.streak * 100 : 0;
        const delta = base + speedBonus + streakBonus;
        return { ...p, score: p.score + delta, streak: p.streak + 1, lastDelta: delta };
      }
      return { ...p, streak: 0, lastDelta: 0 };
    });
    this.phase = s.showLeaderboard ? 'leaderboard' : 'next'; this.emit();
  },

  nextQuestion() {
    if (this.qIdx + 1 >= this.questions.length) { this.phase = 'finished'; this.emit(); }
    else this.loadQuestion(this.qIdx + 1);
  },

  setPaused(v) { this.paused = v; this.emit(); },
};

function useGameState() {
  const [, forceUpdate] = useState(0);
  useEffect(() => gameState.subscribe(() => forceUpdate(x => x + 1)), []);
  return gameState;
}

// ============================================
// SOUND
// ============================================
let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  return audioCtx;
}
function beep(freq, dur = 0.1, type = 'sine', vol = 0.08) {
  const ctx = getCtx(); if (!ctx) return;
  try {
    const osc = ctx.createOscillator(); const g = ctx.createGain();
    osc.type = type; osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}
const sounds = {
  correct: () => { beep(523, 0.1); setTimeout(() => beep(784, 0.18), 80); },
  wrong: () => beep(200, 0.25, 'sawtooth', 0.06),
  countdown: () => beep(440, 0.12, 'triangle'),
  start: () => { beep(523, 0.1); setTimeout(() => beep(659, 0.1), 100); setTimeout(() => beep(784, 0.2), 200); },
  join: () => beep(880, 0.06, 'sine', 0.04),
  tick: () => beep(660, 0.06, 'sine', 0.05),
};

// ============================================
// GLOBAL STYLES INJECTION
// ============================================
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@400;700;900&family=Onest:wght@300;400;500;600;700&display=swap');

  .fq-root * { box-sizing: border-box; }
  .fq-root { font-family: 'Onest', system-ui, sans-serif; }
  .fq-root h1, .fq-root h2, .fq-root h3,
  .fq-root .font-display { font-family: 'Unbounded', system-ui, sans-serif; }

  @keyframes fq-fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fq-scaleIn {
    from { opacity: 0; transform: scale(0.6); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes fq-slideLeft {
    from { opacity: 0; transform: translateX(-20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes fq-chipIn {
    from { opacity: 0; transform: scale(0.8) translateY(-6px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes fq-pulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.08); }
  }
  @keyframes fq-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }
  @keyframes fq-timerPulse {
    0%   { box-shadow: 0 0 0 0 rgba(91,75,234,0.6); }
    70%  { box-shadow: 0 0 0 14px rgba(91,75,234,0); }
    100% { box-shadow: 0 0 0 0 rgba(91,75,234,0); }
  }
  @keyframes fq-growBar {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }
  @keyframes fq-confetti {
    0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(120px) rotate(720deg); opacity: 0; }
  }
  @keyframes fq-answerIn {
    from { opacity: 0; transform: translateX(-24px) scale(0.95); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes fq-podiumRise {
    from { transform: scaleY(0); }
    to   { transform: scaleY(1); }
  }
`;

function StyleTag() {
  useEffect(() => {
    const id = 'fq-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = GLOBAL_CSS;
      document.head.appendChild(style);
    }
  }, []);
  return null;
}

// ============================================
// DESIGN PRIMITIVES
// ============================================
const s = {
  card: {
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 20,
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  },
  cardGlow: {
    border: `1px solid rgba(91,75,234,0.4)`,
    boxShadow: `0 0 32px rgba(91,75,234,0.15), inset 0 1px 0 rgba(255,255,255,0.06)`,
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: COLORS.muted,
    display: 'block',
    marginBottom: 8,
    fontFamily: 'Onest, sans-serif',
  },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '15px 32px',
    background: COLORS.brand,
    color: 'white',
    border: 'none',
    borderRadius: 14,
    fontFamily: 'Onest, sans-serif',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: `0 0 40px ${COLORS.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
    transition: 'all 0.2s',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '14px 28px',
    background: COLORS.surface2,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    fontFamily: 'Onest, sans-serif',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  input: {
    width: '100%',
    background: COLORS.bg,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: '13px 16px',
    color: COLORS.text,
    fontFamily: 'Onest, sans-serif',
    fontSize: 15,
    fontWeight: 500,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
};

// ============================================
// LOGO — text only, no icon
// ============================================
function LogoMark({ size = 36 }) {
  const scale = size / 36;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
      <div style={{
        fontFamily: 'Unbounded, sans-serif', fontWeight: 900,
        fontSize: Math.round(15 * scale), color: COLORS.text,
        letterSpacing: '0.06em',
      }}>
        ФАРОВОН
      </div>
      <div style={{
        fontFamily: 'Onest, sans-serif', fontSize: Math.round(8 * scale),
        letterSpacing: '0.28em', color: COLORS.brandLight, marginTop: 2,
        fontWeight: 500,
      }}>
        АКАДЕМИЯ
      </div>
    </div>
  );
}

// ============================================
// NAVBAR
// ============================================
function Navbar({ right, dark = true }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 24px',
      background: 'rgba(9,9,15,0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: `1px solid ${COLORS.border}`,
      position: 'sticky', top: 0, zIndex: 50,
    }}>
      <LogoMark size={32} />
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>}
    </div>
  );
}

// ============================================
// MAIN APP
// ============================================
export default function App() {
  const [mode, setMode] = useState('landing');
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);
  const [settings, setSettings] = useState({
    title: 'Викторина Фаровон',
    gameCode: '742193',
    showLeaderboard: true,
    soundEffects: true,
    speedBonus: true,
    streakBonus: true,
    showCorrectAnswer: true,
    shuffleQuestions: false,
    shuffleAnswers: false,
  });

  useEffect(() => { if (mode === 'landing') gameState.reset(); }, [mode]);

  return (
    <div className="fq-root" style={{ background: COLORS.bg, minHeight: '100vh', color: COLORS.text }}>
      <StyleTag />
      {mode === 'landing' && <Landing onPick={setMode} />}
      {mode === 'admin' && (
        <AdminPanel
          questions={questions} setQuestions={setQuestions}
          settings={settings} setSettings={setSettings}
          onExit={() => setMode('landing')}
          onHost={() => setMode('host')}
          onDemo={() => setMode('demo')}
        />
      )}
      {mode === 'host' && <HostScreen questions={questions} settings={settings} onExit={() => setMode('landing')} />}
      {mode === 'player' && <PlayerScreen settings={settings} onExit={() => setMode('landing')} />}
      {mode === 'demo' && <DemoMode questions={questions} settings={settings} onExit={() => setMode('landing')} />}
    </div>
  );
}

// ============================================
// LANDING
// ============================================
function Landing({ onPick }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />

      {/* Hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '80px 24px 60px', position: 'relative', overflow: 'hidden',
      }}>
        {/* BG glow */}
        <div style={{
          position: 'absolute', width: 800, height: 800,
          background: 'radial-gradient(circle, rgba(91,75,234,0.15) 0%, transparent 65%)',
          top: '40%', left: '50%', transform: 'translate(-50%,-55%)',
          pointerEvents: 'none',
        }} />

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 18px', borderRadius: 100,
          border: '1px solid rgba(91,75,234,0.4)',
          background: 'rgba(91,75,234,0.12)',
          fontSize: 11, fontWeight: 600, color: COLORS.accent,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          marginBottom: 32, animation: 'fq-fadeUp 0.6s ease both',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.brandLight, animation: 'fq-blink 2s infinite' }} />
          Корпоративная платформа викторин
        </div>

        {/* Title */}
        <h1 className="font-display" style={{
          fontSize: 'clamp(32px, 5vw, 68px)', fontWeight: 900,
          textAlign: 'center', lineHeight: 1.06, letterSpacing: '-0.02em',
          marginBottom: 20, animation: 'fq-fadeUp 0.7s ease 0.1s both',
        }}>
          Викторины, которые<br />
          <span style={{
            background: 'linear-gradient(135deg, #A89FFF 0%, #7B6EFF 50%, #5B4BEA 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            захватывают аудиторию
          </span>
        </h1>

        <p style={{
          fontSize: 17, color: COLORS.muted, textAlign: 'center',
          maxWidth: 500, lineHeight: 1.65, marginBottom: 48,
          animation: 'fq-fadeUp 0.7s ease 0.2s both',
        }}>
          Энерджайзеры, оценка знаний, геймификация обучения. До 100 участников в реальном времени.
        </p>

        {/* CTA cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14,
          maxWidth: 760, width: '100%', marginBottom: 64,
          animation: 'fq-fadeUp 0.7s ease 0.3s both',
        }}>
          <LandingCard
            label="Администратор"
            title="Создать"
            desc="Редактор вопросов, темы, настройки"
            icon="✏️"
            onClick={() => onPick('admin')}
            primary
          />
          <LandingCard
            label="Ведущий"
            title="Запустить"
            desc="QR-код и управление игрой"
            icon="🎮"
            onClick={() => onPick('host')}
          />
          <LandingCard
            label="Участник"
            title="Присоединиться"
            desc="Введите код и играйте"
            icon="👤"
            onClick={() => onPick('player')}
          />
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex', gap: 1, background: COLORS.border,
          borderRadius: 16, overflow: 'hidden',
          border: `1px solid ${COLORS.border}`, maxWidth: 600, width: '100%',
          animation: 'fq-fadeUp 0.7s ease 0.4s both',
        }}>
          {[
            { n: '100', l: 'участников' },
            { n: '<100мс', l: 'задержка' },
            { n: '∞', l: 'вопросов' },
            { n: 'CSV', l: 'экспорт' },
          ].map(({ n, l }) => (
            <div key={l} style={{ flex: 1, padding: '20px 12px', background: COLORS.surface, textAlign: 'center' }}>
              <div className="font-display" style={{ fontSize: 22, fontWeight: 700, color: COLORS.text }}>{n}</div>
              <div style={{ fontSize: 10, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LandingCard({ label, title, desc, icon, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...s.card,
        background: primary ? COLORS.brand : COLORS.surface,
        border: primary ? 'none' : `1px solid ${COLORS.border}`,
        boxShadow: primary ? `0 0 60px ${COLORS.glow}` : 'none',
        textAlign: 'left', cursor: 'pointer', color: COLORS.text,
        padding: '24px', transition: 'transform 0.2s',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: primary ? 'rgba(255,255,255,0.6)' : COLORS.muted, marginBottom: 6 }}>{label}</div>
      <div className="font-display" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: primary ? 'rgba(255,255,255,0.7)' : COLORS.muted, lineHeight: 1.5 }}>{desc}</div>
      <div style={{ marginTop: 16, fontSize: 13, fontWeight: 600, color: primary ? 'white' : COLORS.brandLight }}>
        Начать →
      </div>
    </button>
  );
}

// ============================================
// ADMIN PANEL
// ============================================
function AdminPanel({ questions, setQuestions, settings, setSettings, onExit, onHost, onDemo }) {
  const [selectedQId, setSelectedQId] = useState(questions[0]?.id);
  const [activeTab, setActiveTab] = useState('settings');
  const selectedQ = questions.find(q => q.id === selectedQId);

  const addQuestion = () => {
    const newQ = {
      id: Date.now(), type: 'quiz',
      q: 'Новый вопрос',
      options: ['Вариант 1', 'Вариант 2', 'Вариант 3', 'Вариант 4'],
      correct: 0, time: 20, points: 'standard',
    };
    setQuestions([...questions, newQ]);
    setSelectedQId(newQ.id);
  };

  const updateQ = (id, patch) => setQuestions(questions.map(q => q.id === id ? { ...q, ...patch } : q));

  const deleteQ = (id) => {
    if (questions.length === 1) { alert('Нельзя удалить последний вопрос.'); return; }
    const nq = questions.filter(q => q.id !== id);
    setQuestions(nq);
    if (selectedQId === id) setSelectedQId(nq[0]?.id);
  };

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg }}>
      <Navbar right={
        <>
          <button onClick={onExit} style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 13, fontFamily: 'Onest, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Назад
          </button>
          <button onClick={onDemo} style={{ ...s.btnSecondary, padding: '10px 20px', fontSize: 13 }}>Демо</button>
          <button onClick={onHost} style={{ ...s.btnPrimary, padding: '10px 20px', fontSize: 13 }}>▶ Запустить</button>
        </>
      } />

      <div style={{ display: 'flex', height: 'calc(100vh - 65px)' }}>
        {/* Left sidebar */}
        <div style={{ width: 220, borderRight: `1px solid ${COLORS.border}`, background: COLORS.surface, padding: 16, overflowY: 'auto', flexShrink: 0 }}>
          <div style={s.label}>Вопросы · {questions.length}</div>
          {questions.map((q, i) => (
            <button key={q.id} onClick={() => setSelectedQId(q.id)} style={{
              width: '100%', textAlign: 'left', padding: '10px 12px',
              borderRadius: 12, border: `1px solid ${selectedQId === q.id ? 'rgba(91,75,234,0.5)' : COLORS.border}`,
              background: selectedQId === q.id ? 'rgba(91,75,234,0.15)' : 'transparent',
              color: COLORS.text, cursor: 'pointer', marginBottom: 6,
              fontFamily: 'Onest, sans-serif', transition: 'all 0.15s',
            }}>
              <div style={{ fontSize: 10, color: COLORS.brandLight, marginBottom: 3 }}>#{i + 1}</div>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {q.q || '(пусто)'}
              </div>
            </button>
          ))}
          <button onClick={addQuestion} style={{
            width: '100%', padding: '10px', borderRadius: 12,
            border: `2px dashed ${COLORS.borderStrong}`, background: 'none',
            color: COLORS.muted, cursor: 'pointer', fontSize: 13,
            fontFamily: 'Onest, sans-serif', marginTop: 4,
            transition: 'all 0.15s',
          }}>
            + Добавить вопрос
          </button>
        </div>

        {/* Editor */}
        <div style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
          {selectedQ && (
            <div style={{ maxWidth: 680 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ ...s.label, margin: 0 }}>Редактор вопроса</span>
                <button onClick={() => deleteQ(selectedQ.id)} style={{
                  background: 'rgba(255,79,106,0.1)', border: '1px solid rgba(255,79,106,0.2)',
                  color: COLORS.red, borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
                  fontSize: 12, fontFamily: 'Onest, sans-serif',
                }}>Удалить</button>
              </div>

              {/* Question text */}
              <div style={{ ...s.card, marginBottom: 16 }}>
                <div style={s.label}>Текст вопроса</div>
                <textarea
                  value={selectedQ.q}
                  onChange={e => updateQ(selectedQ.id, { q: e.target.value })}
                  style={{
                    ...s.input, background: 'transparent', border: 'none', padding: 0,
                    fontSize: 20, fontWeight: 700, resize: 'none', lineHeight: 1.4,
                    fontFamily: 'Unbounded, sans-serif', color: COLORS.text,
                  }}
                  rows={2}
                  placeholder="Введите вопрос..."
                />
              </div>

              {/* Answers */}
              <div style={{ marginBottom: 16 }}>
                <div style={s.label}>Варианты ответа · отметьте правильный</div>
                {selectedQ.options.map((opt, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'stretch' }}>
                    <div style={{
                      width: 44, background: ANSWER_COLORS[i], borderRadius: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 14,
                      color: 'white', flexShrink: 0,
                    }}>{ANSWER_LABELS[i]}</div>
                    <input
                      value={opt}
                      onChange={e => {
                        const o = [...selectedQ.options]; o[i] = e.target.value;
                        updateQ(selectedQ.id, { options: o });
                      }}
                      style={{ ...s.input, flex: 1 }}
                      placeholder={`Вариант ${ANSWER_LABELS[i]}`}
                    />
                    <button
                      onClick={() => updateQ(selectedQ.id, { correct: i })}
                      style={{
                        width: 44, borderRadius: 12, border: `1px solid ${COLORS.border}`,
                        background: selectedQ.correct === i ? '#22D3A0' : COLORS.surface2,
                        color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: 16, flexShrink: 0,
                        transition: 'all 0.2s',
                      }}
                    >✓</button>
                  </div>
                ))}
              </div>

              {/* Timer & Points */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={s.card}>
                  <div style={s.label}>Таймер · {selectedQ.time}с</div>
                  <input type="range" min="5" max="120" value={selectedQ.time}
                    onChange={e => updateQ(selectedQ.id, { time: parseInt(e.target.value) })}
                    style={{ width: '100%', accentColor: COLORS.brand }} />
                </div>
                <div style={s.card}>
                  <div style={s.label}>Очки</div>
                  <select value={selectedQ.points} onChange={e => updateQ(selectedQ.id, { points: e.target.value })}
                    style={{ ...s.input, padding: '10px 12px' }}>
                    <option value="none">Без очков</option>
                    <option value="standard">Стандартные</option>
                    <option value="double">×2 Удвоенные</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right settings */}
        <div style={{ width: 260, borderLeft: `1px solid ${COLORS.border}`, background: COLORS.surface, padding: 20, overflowY: 'auto', flexShrink: 0 }}>
          <div style={s.label}>Настройки</div>
          <div style={{ display: 'flex', gap: 4, background: COLORS.surface2, borderRadius: 10, padding: 4, marginBottom: 20 }}>
            {['settings'].map(t => (
              <button key={t} style={{
                flex: 1, padding: '8px', borderRadius: 7, border: 'none',
                background: COLORS.brand, color: 'white',
                fontSize: 12, fontFamily: 'Onest, sans-serif', cursor: 'pointer',
              }}>Основные</button>
            ))}
          </div>
          {[
            ['Название', 'title', 'text'],
            ['Код игры', 'gameCode', 'text'],
          ].map(([label, key, type]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <div style={s.label}>{label}</div>
              <input
                type={type}
                value={settings[key]}
                onChange={e => setSettings({ ...settings, [key]: e.target.value })}
                style={s.input}
              />
            </div>
          ))}
          {[
            ['Рейтинг после вопроса', 'showLeaderboard'],
            ['Бонус за скорость', 'speedBonus'],
            ['Бонус за серию', 'streakBonus'],
            ['Показать ответ', 'showCorrectAnswer'],
          ].map(([label, key]) => (
            <ToggleSetting key={key} label={label} checked={settings[key]} onChange={v => setSettings({ ...settings, [key]: v })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ToggleSetting({ label, checked, onChange }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', cursor: 'pointer' }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>{label}</span>
      <button type="button" onClick={() => onChange(!checked)} style={{
        width: 38, height: 22, borderRadius: 100, padding: 2,
        background: checked ? COLORS.brand : COLORS.surface2,
        border: `1px solid ${COLORS.border}`,
        cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', background: 'white',
          transform: checked ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.2s',
        }} />
      </button>
    </label>
  );
}

// ============================================
// HOST SCREEN
// ============================================
function HostScreen({ questions, settings, onExit }) {
  const state = useGameState();
  const [countdown, setCountdown] = useState(0);
  const tickRef = useRef();

  useEffect(() => {
    gameState.activateHost(questions, settings);
    return () => gameState.reset();
  }, []);

  // Timer
  useEffect(() => {
    if (state.phase !== 'question' || state.paused) return;
    tickRef.current = setInterval(() => {
      if (gameState.paused) return;
      gameState.timeLeft -= 0.1;
      if (gameState.timeLeft <= 5.05 && gameState.timeLeft >= 4.95 && settings.soundEffects) sounds.tick();
      if (gameState.timeLeft <= 0) {
        gameState.timeLeft = 0; clearInterval(tickRef.current); gameState.revealAnswers();
      } else gameState.emit();
    }, 100);
    return () => clearInterval(tickRef.current);
  }, [state.phase, state.paused]);


  // Reveal → scores
  useEffect(() => {
    if (state.phase !== 'reveal') return;
    const t = setTimeout(() => {
      gameState.calcScoresAndShowLeaderboard();
      if (!settings.showLeaderboard) gameState.nextQuestion();
    }, 3500);
    return () => clearTimeout(t);
  }, [state.phase]);

  // Countdown
  useEffect(() => {
    if (countdown <= 0) return;
    if (settings.soundEffects) sounds.countdown();
    const t = setTimeout(() => {
      if (countdown === 1) { gameState.loadQuestion(0); setCountdown(0); }
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const startGame = () => {
    if (gameState.players.length === 0) { alert('Нужен минимум 1 участник'); return; }
    if (settings.soundEffects) sounds.start();
    setCountdown(3); gameState.phase = 'countdown'; gameState.emit();
  };

  const q = state.currentQuestion;
  const answerCounts = q ? [0, 1, 2, 3].map(i => Object.values(state.answers).filter(a => a.choice === i).length) : [0, 0, 0, 0];
  const totalAnswered = Object.keys(state.answers).length;
  const topPlayers = [...state.players].sort((a, b) => b.score - a.score).slice(0, 10);

  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, position: 'relative', overflow: 'hidden' }}>
      {/* ambient bg */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(circle at 15% 20%, rgba(91,75,234,0.12) 0%, transparent 40%),
                     radial-gradient(circle at 85% 80%, rgba(123,110,255,0.08) 0%, transparent 40%)`,
      }} />
      <Navbar right={
        <>
          <button onClick={() => { if (window.confirm('Завершить игру и вернуться?')) onExit(); }}
            style={{ background: 'none', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: 13, fontFamily: 'Onest, sans-serif', display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Назад
          </button>
        </>
      } />
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {state.phase === 'lobby' && (
          <LobbyView players={state.players} onStart={startGame}
            onKick={id => gameState.kickPlayer(id)} gameCode={settings.gameCode} />
        )}
        {state.phase === 'countdown' && <CountdownView n={countdown} />}
        {state.phase === 'question' && q && (
          <QuestionView q={q} qIdx={state.qIdx} total={questions.length}
            timeLeft={state.timeLeft} totalAnswered={totalAnswered}
            totalPlayers={state.players.length} answerCounts={answerCounts}
            paused={state.paused}
            onPause={() => gameState.setPaused(!gameState.paused)}
            onSkip={() => { gameState.timeLeft = 0; gameState.revealAnswers(); }} />
        )}
        {state.phase === 'reveal' && q && <RevealView q={q} answerCounts={answerCounts} />}
        {state.phase === 'leaderboard' && (
          <LeaderboardView players={topPlayers} onNext={() => gameState.nextQuestion()}
            isLast={state.qIdx + 1 >= questions.length} qIdx={state.qIdx} />
        )}
        {state.phase === 'finished' && <FinishedView players={topPlayers} onExit={onExit} onExport={() => exportCSV(state.players)} />}
      </div>
    </div>
  );
}

function exportCSV(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const csv = 'Место,Имя,Очки\n' + sorted.map((p, i) => `${i + 1},"${p.name}",${p.score}`).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `farovon-quiz-${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ============================================
// LOBBY
// ============================================
// ============================================
// REAL QR CODE
// ============================================
function RealQR({ value, size = 120 }) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Load qrcode.js from CDN once
    const scriptId = 'fq-qrcode-script';
    if (document.getElementById(scriptId)) {
      setReady(true);
      return;
    }
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !ref.current) return;
    ref.current.innerHTML = '';
    try {
      new window.QRCode(ref.current, {
        text: value,
        width: size,
        height: size,
        colorDark: '#09090F',
        colorLight: '#ffffff',
        correctLevel: window.QRCode.CorrectLevel.M,
      });
    } catch (e) {
      ref.current.innerHTML = `<div style="width:${size}px;height:${size}px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;color:#333;text-align:center;padding:8px;">QR: ${value}</div>`;
    }
  }, [ready, value, size]);

  return (
    <div style={{
      background: 'white', borderRadius: 12, padding: 8,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {!ready && (
        <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 11 }}>
          Загрузка…
        </div>
      )}
      <div ref={ref} style={{ display: ready ? 'block' : 'none' }} />
    </div>
  );
}

function LobbyView({ players, onStart, onKick, gameCode }) {
  // Build join URL: use current page URL + code param so QR actually works
  const joinUrl = `${window.location.origin}${window.location.pathname}?join=${gameCode}`;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900, margin: '0 auto' }}>
      {/* Join card */}
      <div style={{ ...s.card, ...s.cardGlow, animation: 'fq-fadeUp 0.5s ease' }}>
        <div style={s.label}>Подключиться к игре</div>
        <div className="font-display" style={{ fontSize: 52, fontWeight: 900, letterSpacing: '0.12em', color: COLORS.text, lineHeight: 1 }}>
          <span style={{ color: COLORS.brandLight }}>{gameCode.slice(0, 3)}</span>{' '}{gameCode.slice(3)}
        </div>
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 8, marginBottom: 20 }}>
          quiz.farovon.tj · код: <span style={{ color: COLORS.accent, fontWeight: 600 }}>{gameCode}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <RealQR value={joinUrl} size={110} />
          <div style={{ paddingTop: 8 }}>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>Отсканируйте QR</div>
            <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 4 }}>или откройте сайт и</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>введите код игры</div>
            <div style={{
              marginTop: 12, padding: '6px 12px', borderRadius: 8,
              background: 'rgba(91,75,234,0.15)', border: '1px solid rgba(91,75,234,0.3)',
              fontSize: 11, color: COLORS.accent, wordBreak: 'break-all', lineHeight: 1.5,
            }}>
              {joinUrl.length > 50 ? joinUrl.slice(0, 50) + '…' : joinUrl}
            </div>
          </div>
        </div>
      </div>

      {/* Players */}
      <div style={{ animation: 'fq-fadeUp 0.5s ease 0.1s both' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={s.label}>Участники</div>
            <div className="font-display" style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>
              {players.length}
              <span style={{ fontSize: 20, color: COLORS.muted, fontFamily: 'Onest, sans-serif' }}>/100</span>
            </div>
          </div>
          <button onClick={onStart} disabled={players.length === 0}
            style={{
              ...s.btnPrimary, padding: '14px 28px',
              opacity: players.length === 0 ? 0.4 : 1,
              cursor: players.length === 0 ? 'not-allowed' : 'pointer',
            }}>
            Начать →
          </button>
        </div>

        {players.length === 0 && (
          <div style={{
            padding: '14px 18px', borderRadius: 14,
            background: 'rgba(91,75,234,0.08)', border: '1px solid rgba(91,75,234,0.2)',
            color: COLORS.accent, fontSize: 13, marginBottom: 14,
          }}>
            Ожидаем участников…
          </div>
        )}

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
          maxHeight: 280, overflowY: 'auto',
        }}>
          {[...players].reverse().map((p) => (
            <div key={p.id} onClick={() => onKick(p.id)} title="Нажмите чтобы исключить"
              style={{
                background: COLORS.surface2, border: `1px solid ${COLORS.border}`,
                borderRadius: 10, padding: '8px 10px', fontSize: 12, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                cursor: 'pointer', animation: 'fq-chipIn 0.3s ease',
                transition: 'all 0.15s',
              }}>
              {p.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// COUNTDOWN
// ============================================
function CountdownView({ n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.15em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 24 }}>
          Игра начинается
        </div>
        <div className="font-display" style={{
          fontSize: 200, fontWeight: 900, lineHeight: 1, color: COLORS.brandLight,
          animation: 'fq-scaleIn 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          textShadow: `0 0 80px ${COLORS.glow}`,
        }}>
          {n}
        </div>
      </div>
    </div>
  );
}

// ============================================
// QUESTION VIEW
// ============================================
function QuestionView({ q, qIdx, total, timeLeft, totalAnswered, totalPlayers, answerCounts, paused, onPause, onSkip }) {
  const pct = (timeLeft / q.time) * 100;
  const isLow = timeLeft < 5;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {paused && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 80, marginBottom: 16 }}>⏸</div>
            <div className="font-display" style={{ fontSize: 36, fontWeight: 700, marginBottom: 8 }}>Пауза</div>
            <div style={{ color: COLORS.muted, marginBottom: 32 }}>Таймер остановлен</div>
            <button onClick={onPause} style={s.btnPrimary}>▶ Продолжить</button>
          </div>
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: COLORS.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Вопрос {qIdx + 1} / {total}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {totalAnswered === totalPlayers && totalPlayers > 0 && (
            <button onClick={onSkip} style={{ ...s.btnPrimary, padding: '8px 18px', fontSize: 12 }}>
              Показать результат →
            </button>
          )}
          <div style={{
            background: 'rgba(91,75,234,0.15)', border: '1px solid rgba(91,75,234,0.3)',
            color: COLORS.accent, padding: '6px 14px', borderRadius: 100, fontSize: 12, fontWeight: 500,
          }}>
            {totalAnswered} / {totalPlayers} ответили
          </div>
          <button onClick={onPause} style={{ ...s.btnSecondary, padding: '8px 16px', fontSize: 12 }}>
            {paused ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      {/* Timer bar */}
      <div style={{ height: 6, background: COLORS.surface2, borderRadius: 100, overflow: 'hidden', marginBottom: 32 }}>
        <div style={{
          height: '100%', borderRadius: 100,
          width: `${pct}%`,
          background: isLow
            ? 'linear-gradient(90deg, #E84040, #FF6060)'
            : `linear-gradient(90deg, ${COLORS.brand}, ${COLORS.brandLight})`,
          transition: 'width 0.1s linear',
          boxShadow: isLow ? '0 0 12px rgba(232,64,64,0.6)' : `0 0 12px ${COLORS.glow}`,
        }} />
      </div>

      {/* Question */}
      <h2 className="font-display" style={{
        fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 700,
        textAlign: 'center', lineHeight: 1.25, marginBottom: 20,
        animation: 'fq-fadeUp 0.4s ease',
      }}>
        {q.q}
      </h2>

      {/* Timer circle */}
      <div style={{
        width: 76, height: 76, borderRadius: '50%',
        background: COLORS.surface2,
        border: `3px solid ${isLow ? COLORS.red : COLORS.brand}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Unbounded, sans-serif', fontSize: 26, fontWeight: 700,
        color: isLow ? COLORS.red : COLORS.brandLight,
        margin: '0 auto 28px',
        boxShadow: isLow ? `0 0 28px rgba(255,79,106,0.4)` : `0 0 28px ${COLORS.glow}`,
        animation: isLow ? 'fq-timerPulse 1s ease infinite' : 'none',
        transition: 'all 0.3s',
      }}>
        {Math.ceil(timeLeft)}
      </div>

      {/* Answers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {q.options.map((opt, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '18px 20px', borderRadius: 16,
            background: ANSWER_COLORS[i],
            boxShadow: `0 4px 24px ${ANSWER_GLOWS[i]}`,
            animation: `fq-answerIn 0.4s ease ${i * 0.08}s both`,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: 'rgba(0,0,0,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 14, color: 'white', flexShrink: 0,
            }}>{ANSWER_LABELS[i]}</div>
            <div style={{ flex: 1, fontWeight: 600, fontSize: 15, color: 'white', lineHeight: 1.3 }}>{opt}</div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontFamily: 'Unbounded, sans-serif', fontSize: 14, fontWeight: 700 }}>
              {answerCounts[i]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// REVEAL
// ============================================
function RevealView({ q, answerCounts }) {
  const max = Math.max(...answerCounts, 1);
  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={s.label}>Правильный ответ</div>
        <h2 className="font-display" style={{ fontSize: 'clamp(18px, 2.5vw, 28px)', fontWeight: 700 }}>{q.q}</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'flex-end', height: 280 }}>
        {q.options.map((opt, i) => {
          const isCorrect = i === q.correct;
          const pct = (answerCounts[i] / max) * 100;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ color: COLORS.muted, fontSize: 13, fontFamily: 'Unbounded, sans-serif', fontWeight: 700, marginBottom: 6 }}>
                {answerCounts[i]}
              </div>
              <div style={{
                width: '100%', borderRadius: '12px 12px 0 0',
                background: ANSWER_COLORS[i],
                height: `${Math.max(pct, 8)}%`,
                opacity: isCorrect ? 1 : 0.25,
                boxShadow: isCorrect ? `0 0 32px ${ANSWER_GLOWS[i]}` : 'none',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 10,
                transformOrigin: 'bottom', animation: 'fq-growBar 0.8s cubic-bezier(0.34,1.1,0.64,1)',
                position: 'relative',
                transition: 'all 0.3s',
              }}>
                {isCorrect && (
                  <div style={{ position: 'absolute', top: -36, fontSize: 28 }}>✓</div>
                )}
              </div>
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <div className="font-display" style={{ fontSize: 15, fontWeight: 700 }}>{ANSWER_LABELS[i]}</div>
                <div style={{ fontSize: 11, color: isCorrect ? COLORS.text : COLORS.muted, marginTop: 3, lineHeight: 1.3 }}>
                  {opt}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// LEADERBOARD
// ============================================
function LeaderboardView({ players, onNext, isLast, qIdx }) {
  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={s.label}>Рейтинг · вопрос {qIdx + 1}</div>
        <div className="font-display" style={{ fontSize: 44, fontWeight: 900 }}>
          Топ <span style={{ color: COLORS.brandLight }}>10</span>
        </div>
      </div>

      {players.map((p, i) => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 18px', borderRadius: 14,
          background: i === 0 ? 'rgba(91,75,234,0.15)' : COLORS.surface,
          border: `1px solid ${i === 0 ? 'rgba(91,75,234,0.4)' : COLORS.border}`,
          boxShadow: i === 0 ? '0 0 24px rgba(91,75,234,0.15)' : 'none',
          marginBottom: 8,
          animation: `fq-slideLeft 0.5s ease ${i * 0.05}s both`,
        }}>
          <div className="font-display" style={{
            fontSize: 20, fontWeight: 700, width: 32, textAlign: 'center',
            color: i < 3 ? COLORS.brandLight : COLORS.muted,
          }}>{i + 1}</div>
          <div style={{ flex: 1, fontWeight: 500 }}>{p.name}</div>
          {p.streak > 1 && (
            <div style={{
              fontSize: 11, background: 'rgba(255,181,71,0.12)', color: COLORS.amber,
              border: '1px solid rgba(255,181,71,0.2)', borderRadius: 100,
              padding: '3px 10px', fontWeight: 600,
            }}>🔥 {p.streak}</div>
          )}
          {p.lastDelta > 0 && (
            <div style={{ fontSize: 13, color: COLORS.green, fontWeight: 700 }}>+{p.lastDelta}</div>
          )}
          <div className="font-display" style={{ fontSize: 18, fontWeight: 700, minWidth: 64, textAlign: 'right' }}>
            {p.score.toLocaleString('ru-RU')}
          </div>
        </div>
      ))}

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <button onClick={onNext} style={s.btnPrimary}>
          {isLast ? 'Завершить игру' : 'Следующий вопрос →'}
        </button>
        <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 8 }}>или нажмите Пробел</div>
      </div>
    </div>
  );
}

// ============================================
// FINISHED
// ============================================
function FinishedView({ players, onExit, onExport }) {
  const podium = [players[1], players[0], players[2]].filter(Boolean);
  const heights = [160, 220, 120];
  const podiumColors = [
    'linear-gradient(180deg, #9CA3AF, #6B7280)',
    'linear-gradient(180deg, #A89FFF, #5B4BEA)',
    'linear-gradient(180deg, #FFB547, #E8A020)',
  ];
  const places = [2, 1, 3];

  // Confetti dots
  const confetti = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: [COLORS.brand, COLORS.brandLight, COLORS.green, COLORS.amber, COLORS.red][i % 5],
    delay: Math.random() * 1.5,
    dur: 1.5 + Math.random(),
  }));

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
      {/* Confetti */}
      {confetti.map(c => (
        <div key={c.id} style={{
          position: 'absolute', width: 8, height: 8, borderRadius: 2,
          background: c.color, left: `${c.left}%`, top: -20,
          animation: `fq-confetti ${c.dur}s ease ${c.delay}s both`,
          pointerEvents: 'none',
        }} />
      ))}

      <div style={s.label}>Итоги викторины</div>
      <div className="font-display" style={{ fontSize: 48, fontWeight: 900, marginBottom: 48 }}>Победители</div>

      {/* Podium */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 16, marginBottom: 48 }}>
        {podium.map((p, i) => p && (
          <div key={p.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 200 }}>
            <div className="font-display" style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{p.name}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: COLORS.accent }}>{p.score.toLocaleString('ru-RU')}</div>
            <div style={{
              width: '100%', height: heights[i],
              background: podiumColors[i],
              borderRadius: '12px 12px 0 0',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 16,
              boxShadow: i === 1 ? `0 0 60px ${COLORS.glow}` : 'none',
              transformOrigin: 'bottom',
              animation: `fq-podiumRise 1s cubic-bezier(0.34,1.1,0.64,1) ${i * 0.15}s both`,
            }}>
              <div className="font-display" style={{ fontSize: 48, fontWeight: 900, color: 'rgba(255,255,255,0.9)' }}>
                {places[i]}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Rest */}
      <div style={{ maxWidth: 440, margin: '0 auto 32px', textAlign: 'left' }}>
        {players.slice(3, 10).map((p, i) => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '10px 14px', borderRadius: 10,
            background: COLORS.surface, border: `1px solid ${COLORS.border}`,
            marginBottom: 6,
          }}>
            <div style={{ color: COLORS.muted, width: 20, fontFamily: 'Unbounded, sans-serif', fontSize: 12 }}>{i + 4}</div>
            <div style={{ flex: 1, fontWeight: 500 }}>{p.name}</div>
            <div className="font-display" style={{ fontSize: 14, fontWeight: 700 }}>{p.score.toLocaleString('ru-RU')}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={onExport} style={s.btnPrimary}>Скачать CSV</button>
        <button onClick={onExit} style={s.btnSecondary}>На главную</button>
      </div>
    </div>
  );
}

// ============================================
// PLAYER SCREEN
// ============================================
function PlayerScreen({ settings, onExit }) {
  const state = useGameState();
  const [nick, setNick] = useState('');
  // Auto-fill code from URL param ?join=XXXXXX (QR code scan)
  const urlCode = new URLSearchParams(window.location.search).get('join') || settings.gameCode;
  const [code, setCode] = useState(urlCode);
  const [joinError, setJoinError] = useState('');
  const [myPlayer, setMyPlayer] = useState(null);
  const [myChoice, setMyChoice] = useState(null);
  const [answeredFor, setAnsweredFor] = useState(null);

  const join = () => {
    if (!state.hostActive) { setJoinError('Игра ещё не запущена.'); return; }
    if (state.phase !== 'lobby') { setJoinError('Игра уже началась.'); return; }
    if (nick.trim().length < 2) { setJoinError('Имя минимум 2 символа.'); return; }
    if (code !== gameState.settings?.gameCode) { setJoinError('Неверный код игры.'); return; }
    const result = gameState.addPlayer(nick);
    if (result.error) { setJoinError(result.error); return; }
    setMyPlayer(result.player); setJoinError('');
  };

  const answer = (i) => {
    if (answeredFor === state.qIdx || state.paused) return;
    setMyChoice(i); setAnsweredFor(state.qIdx);
    gameState.submitAnswer(myPlayer.id, i);
  };

  useEffect(() => {
    if (state.phase === 'question' && answeredFor !== state.qIdx) setMyChoice(null);
  }, [state.phase, state.qIdx]);

  useEffect(() => {
    if (state.phase === 'reveal' && myPlayer && settings.soundEffects) {
      const a = state.answers[myPlayer.id]; const q = state.currentQuestion;
      if (a && q && a.choice === q.correct) sounds.correct();
      else if (a) sounds.wrong();
    }
  }, [state.phase]);

  const centeredWrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', background: COLORS.bg };

  // Join screen
  if (!myPlayer) {
    return (
      <div style={centeredWrap}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <LogoMark size={40} />
          </div>
          <div className="font-display" style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', marginBottom: 28 }}>
            Присоединиться
          </div>
          {!state.hostActive && (
            <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(255,181,71,0.1)', border: '1px solid rgba(255,181,71,0.2)', color: COLORS.amber, fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              Ожидание ведущего…
            </div>
          )}
          <div style={{ ...s.card, gap: 0 }}>
            <div style={{ marginBottom: 14 }}>
              <label style={s.label}>Код игры</label>
              <input value={code} onChange={e => { setCode(e.target.value); setJoinError(''); }}
                style={{ ...s.input, fontFamily: 'Unbounded, sans-serif', fontSize: 26, letterSpacing: '0.15em', textAlign: 'center' }}
                placeholder="000000" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={s.label}>Ваш ник</label>
              <input value={nick} onChange={e => { setNick(e.target.value); setJoinError(''); }}
                onKeyDown={e => e.key === 'Enter' && join()}
                style={s.input} placeholder="Введите имя" maxLength={20} />
            </div>
            {joinError && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,79,106,0.1)', border: '1px solid rgba(255,79,106,0.2)', color: COLORS.red, fontSize: 13, marginBottom: 14 }}>
                {joinError}
              </div>
            )}
            <button onClick={join} disabled={nick.trim().length < 2 || !state.hostActive}
              style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center', opacity: (nick.trim().length < 2 || !state.hostActive) ? 0.4 : 1 }}>
              {state.hostActive ? 'Войти →' : 'Ожидание…'}
            </button>
          </div>
          <button onClick={onExit} style={{ ...s.btnSecondary, width: '100%', justifyContent: 'center', marginTop: 12, background: 'none', border: 'none' }}>
            ← Назад
          </button>
        </div>
      </div>
    );
  }

  // Kicked
  if (!state.players.find(p => p.id === myPlayer.id)) {
    return (
      <div style={centeredWrap}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 60, marginBottom: 16 }}>👋</div>
          <div className="font-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Вы покинули игру</div>
          <div style={{ color: COLORS.muted, marginBottom: 24 }}>Ведущий исключил вас</div>
          <button onClick={onExit} style={s.btnPrimary}>На главную</button>
        </div>
      </div>
    );
  }

  // Lobby
  if (state.phase === 'lobby') {
    return (
      <div style={centeredWrap}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 12 }}>Добро пожаловать</div>
          <div className="font-display" style={{ fontSize: 36, fontWeight: 700, marginBottom: 24 }}>{myPlayer.name}</div>
          <div style={{ ...s.card, marginBottom: 20 }}>
            <div style={s.label}>Участников в игре</div>
            <div className="font-display" style={{ fontSize: 40, fontWeight: 700 }}>{state.players.length}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS.brand, animation: `fq-pulse 1.4s ease ${i * 0.2}s infinite` }} />
            ))}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 14 }}>Ожидание ведущего…</div>
        </div>
      </div>
    );
  }

  // Countdown
  if (state.phase === 'countdown') {
    return (
      <div style={centeredWrap}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: COLORS.muted, marginBottom: 16 }}>Игра начинается</div>
          <div className="font-display" style={{ fontSize: 80, fontWeight: 900, color: COLORS.brandLight, animation: 'fq-pulse 0.8s ease infinite' }}>
            Готовы?
          </div>
        </div>
      </div>
    );
  }

  // Question — paused
  if (state.phase === 'question' && state.paused) {
    return (
      <div style={{ ...centeredWrap, background: '#030308' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>⏸</div>
          <div className="font-display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Пауза</div>
          <div style={{ color: COLORS.muted }}>Ведущий поставил игру на паузу</div>
        </div>
      </div>
    );
  }

  // Question — answered
  if (state.phase === 'question' && answeredFor === state.qIdx) {
    return (
      <div style={{ minHeight: '100vh', background: ANSWER_COLORS[myChoice], display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20, background: 'rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 32,
            margin: '0 auto 20px', animation: 'fq-scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {ANSWER_LABELS[myChoice]}
          </div>
          <div className="font-display" style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Ответ принят!</div>
          <div style={{ color: 'rgba(255,255,255,0.75)', marginBottom: 24 }}>Ждём остальных…</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            {Object.keys(state.answers).length} из {state.players.length} ответили
          </div>
        </div>
      </div>
    );
  }

  // Question — active
  if (state.phase === 'question') {
    const q = state.currentQuestion; if (!q) return null;
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, padding: 20, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: COLORS.muted, fontWeight: 500 }}>{myPlayer.name}</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>Вопрос {state.qIdx + 1}</div>
          <div className="font-display" style={{ fontSize: 13, color: COLORS.brandLight, fontWeight: 700 }}>
            {(state.players.find(p => p.id === myPlayer.id)?.score || 0).toLocaleString('ru-RU')}
          </div>
        </div>
        <div style={{ height: 5, background: COLORS.surface2, borderRadius: 100, marginBottom: 20, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 100,
            width: `${(state.timeLeft / q.time) * 100}%`,
            background: state.timeLeft > 5 ? `linear-gradient(90deg, ${COLORS.brand}, ${COLORS.brandLight})` : 'linear-gradient(90deg, #E84040, #FF6060)',
            transition: 'width 0.1s linear',
          }} />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, maxWidth: 440, margin: '0 auto', width: '100%' }}>
          <div style={{ textAlign: 'center', fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
            Выберите ответ · {Math.ceil(state.timeLeft)}с
          </div>
          {q.options.map((opt, i) => (
            <button key={i} onClick={() => answer(i)} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: '18px 20px', borderRadius: 16, border: 'none',
              background: ANSWER_COLORS[i], cursor: 'pointer',
              boxShadow: `0 4px 20px ${ANSWER_GLOWS[i]}`,
              transition: 'transform 0.15s',
              animation: `fq-answerIn 0.4s ease ${i * 0.08}s both`,
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: 'rgba(0,0,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Unbounded, sans-serif', fontWeight: 700, fontSize: 14, color: 'white', flexShrink: 0,
              }}>{ANSWER_LABELS[i]}</div>
              <div style={{ flex: 1, textAlign: 'left', fontWeight: 600, fontSize: 15, color: 'white', lineHeight: 1.3 }}>{opt}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Reveal
  if (state.phase === 'reveal') {
    const q = state.currentQuestion;
    const myAnswer = state.answers[myPlayer.id];
    const isCorrect = myAnswer && myAnswer.choice === q.correct;
    const me = state.players.find(p => p.id === myPlayer.id);
    return (
      <div style={centeredWrap}>
        <div style={{ textAlign: 'center', width: '100%', maxWidth: 360 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: !myAnswer ? COLORS.surface2 : isCorrect ? 'rgba(34,211,160,0.15)' : 'rgba(255,79,106,0.15)',
            border: `2px solid ${!myAnswer ? COLORS.border : isCorrect ? COLORS.green : COLORS.red}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, margin: '0 auto 16px',
            animation: 'fq-scaleIn 0.5s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {!myAnswer ? '⏱' : isCorrect ? '✓' : '✕'}
          </div>
          <div className="font-display" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            {!myAnswer ? 'Не успели' : isCorrect ? 'Правильно!' : 'Неверно'}
          </div>
          <div style={{ color: COLORS.muted, fontSize: 14, marginBottom: 24 }}>
            {!myAnswer ? 'В следующий раз быстрее' : isCorrect ? 'Отличная скорость!' : `Правильно: ${q.options[q.correct]}`}
          </div>
          <div style={s.card}>
            <div style={s.label}>Ваш счёт</div>
            <div className="font-display" style={{ fontSize: 40, fontWeight: 700 }}>
              {(me?.score || 0).toLocaleString('ru-RU')}
            </div>
            {me?.lastDelta > 0 && (
              <div style={{ fontSize: 13, color: COLORS.green, fontWeight: 600, marginTop: 4 }}>+{me.lastDelta} очков</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Leaderboard
  if (state.phase === 'leaderboard') {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.id === myPlayer.id) + 1;
    const me = sorted[myRank - 1];
    return (
      <div style={centeredWrap}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={s.label}>Ваше место</div>
            <div className="font-display" style={{ fontSize: 64, fontWeight: 900, color: COLORS.brandLight, lineHeight: 1 }}>
              #{myRank}
            </div>
            <div style={{ color: COLORS.muted, fontSize: 13 }}>из {state.players.length}</div>
          </div>
          <div style={{ ...s.card, marginBottom: 16, textAlign: 'center' }}>
            <div style={s.label}>Очки</div>
            <div className="font-display" style={{ fontSize: 34, fontWeight: 700 }}>{(me?.score || 0).toLocaleString('ru-RU')}</div>
            {me?.lastDelta > 0 && <div style={{ fontSize: 12, color: COLORS.green, fontWeight: 600, marginTop: 4 }}>+{me.lastDelta} за вопрос</div>}
          </div>
          {sorted.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10, marginBottom: 6,
              background: p.id === myPlayer.id ? 'rgba(91,75,234,0.15)' : COLORS.surface,
              border: `1px solid ${p.id === myPlayer.id ? 'rgba(91,75,234,0.4)' : COLORS.border}`,
            }}>
              <div style={{ width: 20, color: COLORS.muted, fontSize: 12, fontFamily: 'Unbounded, sans-serif' }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{p.name}</div>
              <div className="font-display" style={{ fontSize: 13, fontWeight: 700 }}>{p.score.toLocaleString('ru-RU')}</div>
            </div>
          ))}
          <div style={{ textAlign: 'center', color: COLORS.muted, fontSize: 12, marginTop: 16 }}>Ждём следующий вопрос…</div>
        </div>
      </div>
    );
  }

  // Finished
  if (state.phase === 'finished') {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const myRank = sorted.findIndex(p => p.id === myPlayer.id) + 1;
    const me = sorted[myRank - 1];
    const medal = myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎯';
    return (
      <div style={centeredWrap}>
        <div style={{ textAlign: 'center', maxWidth: 360, width: '100%' }}>
          <div style={{ fontSize: 80, marginBottom: 12 }}>{medal}</div>
          <div className="font-display" style={{ fontSize: 30, fontWeight: 700, marginBottom: 6 }}>Игра окончена</div>
          <div style={{ color: COLORS.muted, marginBottom: 24 }}>Спасибо за участие!</div>
          <div style={{ ...s.card, marginBottom: 20, textAlign: 'center' }}>
            <div style={s.label}>Итоговое место</div>
            <div className="font-display" style={{ fontSize: 52, fontWeight: 700, marginBottom: 4 }}>#{myRank}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.accent }}>{(me?.score || 0).toLocaleString('ru-RU')} очков</div>
          </div>
          <button onClick={onExit} style={{ ...s.btnPrimary, width: '100%', justifyContent: 'center' }}>На главную</button>
        </div>
      </div>
    );
  }

  return null;
}

// ============================================
// DEMO MODE
// ============================================
function DemoMode({ questions, settings, onExit }) {
  const [showPlayer, setShowPlayer] = useState(true);

  useEffect(() => {
    gameState.activateHost(questions, settings);
    return () => gameState.reset();
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#000' }}>
      <div style={{
        background: '#0a0a0a', borderBottom: `1px solid ${COLORS.border}`,
        padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 11, color: COLORS.muted, fontFamily: 'monospace', letterSpacing: '0.08em' }}>
          DEMO MODE · Ведущий слева · Участник справа
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowPlayer(!showPlayer)} style={{ ...s.btnSecondary, padding: '6px 14px', fontSize: 12 }}>
            {showPlayer ? 'Скрыть участника' : 'Показать'}
          </button>
          <button onClick={onExit} style={{ ...s.btnPrimary, padding: '6px 14px', fontSize: 12, background: COLORS.red }}>
            Выйти
          </button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: showPlayer ? '1fr 1fr' : '1fr', height: 'calc(100vh - 41px)' }}>
        <div style={{ overflowY: 'auto', borderRight: showPlayer ? `1px solid ${COLORS.border}` : 'none' }}>
          <DemoHostPane questions={questions} settings={settings} />
        </div>
        {showPlayer && (
          <div style={{ overflowY: 'auto' }}>
            <PlayerScreen settings={settings} onExit={() => {}} />
          </div>
        )}
      </div>
    </div>
  );
}

function DemoHostPane({ questions, settings }) {
  const state = useGameState();
  const [countdown, setCountdown] = useState(0);
  const tickRef = useRef();

  useEffect(() => {
    if (state.phase !== 'question' || state.paused) return;
    tickRef.current = setInterval(() => {
      if (gameState.paused) return;
      gameState.timeLeft -= 0.1;
      if (gameState.timeLeft <= 0) { gameState.timeLeft = 0; clearInterval(tickRef.current); gameState.revealAnswers(); }
      else gameState.emit();
    }, 100);
    return () => clearInterval(tickRef.current);
  }, [state.phase, state.paused]);

  useEffect(() => {
    if (state.phase !== 'reveal') return;
    const t = setTimeout(() => {
      gameState.calcScoresAndShowLeaderboard();
      if (!settings.showLeaderboard) gameState.nextQuestion();
    }, 3500);
    return () => clearTimeout(t);
  }, [state.phase]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => {
      if (countdown === 1) { gameState.loadQuestion(0); setCountdown(0); }
      else setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const startGame = () => {
    if (gameState.players.length === 0) { alert('Сначала присоединитесь как участник →'); return; }
    setCountdown(3); gameState.phase = 'countdown'; gameState.emit();
  };

  const addBot = () => {
    const name = NAMES_POOL[Math.floor(Math.random() * NAMES_POOL.length)] + Math.floor(Math.random() * 99);
    gameState.addPlayer(name);
  };

  const q = state.currentQuestion;
  const answerCounts = q ? [0, 1, 2, 3].map(i => Object.values(state.answers).filter(a => a.choice === i).length) : [0, 0, 0, 0];
  const topPlayers = [...state.players].sort((a, b) => b.score - a.score).slice(0, 10);

  return (
    <div style={{ minHeight: '100%', background: COLORS.bg, color: COLORS.text }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${COLORS.border}`, display: 'flex', gap: 8, alignItems: 'center' }}>
        <LogoMark size={24} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {state.phase === 'lobby' && (
            <button onClick={addBot} style={{ ...s.btnSecondary, padding: '6px 12px', fontSize: 11 }}>+ Бот</button>
          )}
          {state.phase === 'question' && (
            <button onClick={() => gameState.setPaused(!gameState.paused)}
              style={{ ...s.btnPrimary, padding: '6px 12px', fontSize: 11 }}>
              {gameState.paused ? '▶' : '⏸'}
            </button>
          )}
        </div>
      </div>
      <div style={{ padding: 20 }}>
        {state.phase === 'lobby' && <LobbyView players={state.players} onStart={startGame} onKick={id => gameState.kickPlayer(id)} gameCode={settings.gameCode} />}
        {state.phase === 'countdown' && <CountdownView n={countdown} />}
        {state.phase === 'question' && q && (
          <QuestionView q={q} qIdx={state.qIdx} total={questions.length} timeLeft={state.timeLeft}
            totalAnswered={Object.keys(state.answers).length} totalPlayers={state.players.length}
            answerCounts={answerCounts} paused={state.paused}
            onPause={() => gameState.setPaused(!gameState.paused)}
            onSkip={() => { gameState.timeLeft = 0; gameState.revealAnswers(); }} />
        )}
        {state.phase === 'reveal' && q && <RevealView q={q} answerCounts={answerCounts} />}
        {state.phase === 'leaderboard' && (
          <LeaderboardView players={topPlayers} onNext={() => gameState.nextQuestion()}
            isLast={state.qIdx + 1 >= questions.length} qIdx={state.qIdx} />
        )}
        {state.phase === 'finished' && <FinishedView players={topPlayers} onExit={() => {}} onExport={() => {}} />}
      </div>
    </div>
  );
}
  );
}
