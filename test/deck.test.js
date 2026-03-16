const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Override sessions file path for tests
const TEST_SESSIONS_FILE = path.join(__dirname, '../data/test-sessions.json');
process.env.SESSIONS_FILE = TEST_SESSIONS_FILE;

const { getSession, updateSession, buildSummaryData } = require('../src/sessionStore');

describe('Session Store', () => {
  const testId = 'test-session-001';

  before(() => {
    if (fs.existsSync(TEST_SESSIONS_FILE)) {
      fs.unlinkSync(TEST_SESSIONS_FILE);
    }
  });

  after(() => {
    if (fs.existsSync(TEST_SESSIONS_FILE)) {
      fs.unlinkSync(TEST_SESSIONS_FILE);
    }
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

  it('handles completed state', () => {
    updateSession(testId, { completed: true });
    const session = getSession(testId);
    assert.equal(session.completed, true);
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
