// src/sessionStore.js
'use strict';

const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = process.env.SESSIONS_FILE || path.join(__dirname, '../data/sessions.json');

function loadSessions() {
  if (!fs.existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
  // Write to temp file first, then rename — atomic write to prevent corruption
  const tmp = SESSIONS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(sessions, null, 2));
  fs.renameSync(tmp, SESSIONS_FILE);
}

function getSession(id) {
  return loadSessions()[id] || null;
}

function updateSession(id, data) {
  const sessions = loadSessions();
  sessions[id] = { ...(sessions[id] || {}), ...data };
  saveSessions(sessions);
  return sessions[id];
}

function buildSummaryData(session) {
  const scores = session.scores || [];
  const correct = scores.filter(s => s && s.correct).length;
  const total = session.cards.length;
  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const weakCards = session.cards.filter((_, i) => !scores[i] || !scores[i].correct);
  return { sessionId: session.sessionId, correct, total, scorePercent, weakCards };
}

module.exports = { getSession, updateSession, buildSummaryData, loadSessions, saveSessions };
