const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const SESSIONS_FILE = path.join(__dirname, '../data/sessions.json');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(SESSIONS_FILE))) {
  fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
}

// Load sessions
function loadSessions() {
  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } catch (e) {
      console.error('Error loading sessions:', e);
      return {};
    }
  }
  return {};
}

// Save sessions
function saveSessions(sessions) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || 'placeholder',
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN || 'placeholder',
  receiver,
});

receiver.router.use(express.json());

// POST /deck/create
receiver.router.post('/deck/create', async (req, res) => {
  const { channel, cards, title = 'Flashcard Session' } = req.body;
  if (!channel || !cards || !Array.isArray(cards)) {
    return res.status(400).json({ error: 'Missing channel or cards' });
  }

  const sessionId = uuidv4();
  const sessions = loadSessions();

  // Post opening message
  try {
    const result = await app.client.chat.postMessage({
      channel,
      text: `Starting session: *${title}*`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🚀 ${title}` }
        }
      ]
    });

    const threadTs = result.ts;

    sessions[sessionId] = {
      sessionId,
      channel,
      threadTs,
      title,
      cards,
      currentIndex: 0,
      correctCount: 0,
      totalCount: cards.length,
      weakCards: [],
      history: []
    };

    saveSessions(sessions);

    // Post first card
    await postCard(sessionId, sessions[sessionId]);

    res.json({ sessionId, threadTs });
  } catch (error) {
    console.error('Error creating deck:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /deck/:sessionId/score
receiver.router.post('/deck/:sessionId/score', async (req, res) => {
  const { sessionId } = req.params;
  const { correct, feedback = '' } = req.body;
  const sessions = loadSessions();
  const session = sessions[sessionId];

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const currentCard = session.cards[session.currentIndex];
  
  if (correct) {
    session.correctCount++;
  } else {
    session.weakCards.push(currentCard);
  }

  // Post score block
  try {
    await app.client.chat.postMessage({
      channel: session.channel,
      thread_ts: session.threadTs,
      text: correct ? '✅ Correct!' : '❌ Incorrect',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${correct ? '✅ *Correct!*' : '❌ *Incorrect*'}\n${feedback ? `> ${feedback}\n` : ''}*Answer:* ${currentCard.answer}\n_Card ${session.currentIndex + 1} of ${session.totalCount}_`
          }
        }
      ]
    });

    session.currentIndex++;
    saveSessions(sessions);

    if (session.currentIndex < session.totalCount) {
      await postCard(sessionId, session);
    } else {
      await postSummary(sessionId, session);
    }

    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error scoring:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /deck/:sessionId/summary
receiver.router.get('/deck/:sessionId/summary', (req, res) => {
  const { sessionId } = req.params;
  const sessions = loadSessions();
  const session = sessions[sessionId];

  if (!session) return res.status(404).json({ error: 'Session not found' });

  const scorePercent = Math.round((session.correctCount / session.totalCount) * 100);
  res.json({
    correct: session.correctCount,
    total: session.totalCount,
    scorePercent,
    weakCards: session.weakCards
  });
});

// POST /deck/:sessionId/retry-weak
receiver.router.post('/deck/:sessionId/retry-weak', async (req, res) => {
  const { sessionId } = req.params;
  const sessions = loadSessions();
  const session = sessions[sessionId];

  if (!session) return res.status(404).json({ error: 'Session not found' });
  if (session.weakCards.length === 0) return res.status(400).json({ error: 'No weak cards to retry' });

  const newSessionId = uuidv4();
  
  try {
    const result = await app.client.chat.postMessage({
      channel: session.channel,
      text: `Retrying ${session.weakCards.length} weak cards...`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🔄 Retrying Weak Cards` }
        }
      ]
    });

    const threadTs = result.ts;

    sessions[newSessionId] = {
      sessionId: newSessionId,
      channel: session.channel,
      threadTs,
      title: `Retry: ${session.title}`,
      cards: [...session.weakCards],
      currentIndex: 0,
      correctCount: 0,
      totalCount: session.weakCards.length,
      weakCards: [],
      history: []
    };

    saveSessions(sessions);
    await postCard(newSessionId, sessions[newSessionId]);

    res.json({ sessionId: newSessionId, threadTs });
  } catch (error) {
    console.error('Error retrying weak cards:', error);
    res.status(500).json({ error: error.message });
  }
});

async function postCard(sessionId, session) {
  const card = session.cards[session.currentIndex];
  await app.client.chat.postMessage({
    channel: session.channel,
    thread_ts: session.threadTs,
    text: `Card ${session.currentIndex + 1}: ${card.question}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Card ${session.currentIndex + 1} of ${session.totalCount}*\n\n${card.question}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: ' 💡 _Reply to this thread with your answer_'
          }
        ]
      }
    ]
  });
}

async function postSummary(sessionId, session) {
  const scorePercent = Math.round((session.correctCount / session.totalCount) * 100);
  const weakList = session.weakCards.map(c => `• ${c.question}`).join('\n') || 'None!';

  await app.client.chat.postMessage({
    channel: session.channel,
    thread_ts: session.threadTs,
    text: `Session Complete! Score: ${scorePercent}%`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🏁 Session Complete' }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Score:* ${session.correctCount} / ${session.totalCount} (${scorePercent}%)\n\n*Weak Cards:*\n${weakList}`
        }
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: session.weakCards.length > 0 ? ' 💡 _Tip: You can retry the weak cards to reinforce your knowledge._' : ' 🌟 _Perfect score! You are ready!_'
          }
        ]
      }
    ]
  });
}

(async () => {
  const port = process.env.PORT || 3456;
  await app.start(port);
  console.log(`⚡️ Flashcard app is running on port ${port}`);
})();
