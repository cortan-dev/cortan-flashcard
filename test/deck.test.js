const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// We test the session store logic in isolation
// by extracting it from index.js or duplicating the pure functions here

const SESSIONS_FILE = path.join(__dirname, '../data/test-sessions.json');

// Inline the session store helpers for testing
function loadSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return {};
  return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
}
function saveSessions(sessions) {
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
function updateSession(id, data) {
  const sessions = loadSessions();
  sessions[id] = { ...sessions[id], ...data };
  saveSessions(sessions);
  return sessions[id];
}
function getSession(id) {
  return loadSessions()[id] || null;
}
function buildSummaryData(session) {
  const scores = session.scores || [];
  const correct = scores.filter(s => s?.correct).length;
  const total = session.cards.length;
  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const weakCards = session.cards.filter((_, i) => !scores[i]?.correct);
  return { sessionId: session.sessionId, correct, total, scorePercent, weakCards };
}

describe('Session Store', () => {
  const testId = 'test-session-001';

  before(() => {
    fs.mkdirSync(path.join(__dirname, '../data'), { recursive: true });
    // Clean up any leftover test session
    const sessions = loadSessions();
    delete sessions[testId];
    saveSessions(sessions);
  });

  after(() => {
    // Clean up test session
    const sessions = loadSessions();
    delete sessions[testId];
    saveSessions(sessions);
  });

  it('creates and retrieves a session', () => {
    const session = {
      sessionId: testId,
      channel: 'C123',
      title: 'Test Deck',
      cards: [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
      ],
      currentIndex: 0,
      scores: [],
    };
    updateSession(testId, session);
    const retrieved = getSession(testId);
    assert.equal(retrieved.sessionId, testId);
    assert.equal(retrieved.cards.length, 2);
  });

  it('updates session currentIndex', () => {
    updateSession(testId, { currentIndex: 1 });
    const session = getSession(testId);
    assert.equal(session.currentIndex, 1);
  });

  it('returns null for unknown session', () => {
    assert.equal(getSession('nonexistent'), null);
  });
});

describe('buildSummaryData', () => {
  it('calculates 100% score', () => {
    const session = {
      sessionId: 's1',
      cards: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }],
      scores: [{ correct: true }, { correct: true }],
    };
    const summary = buildSummaryData(session);
    assert.equal(summary.correct, 2);
    assert.equal(summary.total, 2);
    assert.equal(summary.scorePercent, 100);
    assert.equal(summary.weakCards.length, 0);
  });

  it('calculates 50% score with weak cards', () => {
    const session = {
      sessionId: 's2',
      cards: [{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2' }],
      scores: [{ correct: true }, { correct: false }],
    };
    const summary = buildSummaryData(session);
    assert.equal(summary.correct, 1);
    assert.equal(summary.scorePercent, 50);
    assert.equal(summary.weakCards.length, 1);
    assert.equal(summary.weakCards[0].question, 'Q2');
  });

  it('calculates 0% score', () => {
    const session = {
      sessionId: 's3',
      cards: [{ question: 'Q1', answer: 'A1' }],
      scores: [{ correct: false }],
    };
    const summary = buildSummaryData(session);
    assert.equal(summary.scorePercent, 0);
    assert.equal(summary.weakCards.length, 1);
  });

  it('handles empty scores array', () => {
    const session = {
      sessionId: 's4',
      cards: [{ question: 'Q1', answer: 'A1' }],
      scores: [],
    };
    const summary = buildSummaryData(session);
    assert.equal(summary.correct, 0);
    assert.equal(summary.total, 1);
  });
});
