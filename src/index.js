require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSession, updateSession, buildSummaryData } = require('./sessionStore');

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET || 'placeholder',
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN || 'placeholder',
  receiver,
});

receiver.router.use(express.json());

receiver.router.post('/deck/create', async (req, res) => {
  const { channel, cards, title = 'Flashcard Session' } = req.body;
  if (!channel || !cards || !Array.isArray(cards)) {
    return res.status(400).json({ error: 'Missing channel or cards' });
  }

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card.question || typeof card.question !== "string" || card.question.trim() === "" ||
        !card.answer || typeof card.answer !== "string" || card.answer.trim() === "") {
      return res.status(400).json({ error: "Card at index " + i + " is malformed. Both question and answer must be non-empty strings." });
    }
  }
  const sessionId = uuidv4();
  try {
    const result = await app.client.chat.postMessage({
      channel,
      text: "Starting session: " + title,
      blocks: [{ type: 'header', text: { type: 'plain_text', text: "🚀 " + title } }]
    });
    const threadTs = result.ts;
    const session = updateSession(sessionId, {
      sessionId, channel, threadTs, title, cards, currentIndex: 0, scores: [], completed: false
    });
    await postCard(session);
    res.json({ sessionId, threadTs });
  } catch (error) {
    console.error('Error creating deck:', error);
    res.status(500).json({ error: error.message });
  }
});

receiver.router.post('/deck/:sessionId/score', async (req, res) => {
  const { sessionId } = req.params;
  const { correct, feedback = "" } = req.body;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.completed) {
    return res.status(400).json({ error: "Session already completed" });
  }

  const currentCard = session.cards[session.currentIndex];
  try {
    await app.client.chat.postMessage({
      channel: session.channel,
      thread_ts: session.threadTs,
      text: correct ? '✅ Correct!' : '❌ Incorrect',
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: (correct ? '✅ *Correct!*' : '❌ *Incorrect*') + "\n" + (feedback ? "> " + feedback + "\n" : "") + "*Answer:* " + currentCard.answer + "\n_Card " + (session.currentIndex + 1) + " of " + session.cards.length + "_"
        }
      }]
    });
    const scores = session.scores || [];
    scores.push({ correct: !!correct });
    const updatedSession = updateSession(sessionId, { scores, currentIndex: session.currentIndex + 1 });
    if (updatedSession.currentIndex < updatedSession.cards.length) {
      await postCard(updatedSession);
    } else {
      await postSummary(sessionId, updatedSession);
    }
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Error scoring:', error);
    res.status(500).json({ error: error.message });
  }
});

receiver.router.get('/deck/:sessionId/summary', (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(buildSummaryData(session));
});

receiver.router.post('/deck/:sessionId/retry-weak', async (req, res) => {
  const { sessionId } = req.params;
  const session = getSession(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const summary = buildSummaryData(session);
  if (summary.weakCards.length === 0) return res.status(400).json({ error: 'No weak cards to retry' });
  const newSessionId = uuidv4();
  try {
    const result = await app.client.chat.postMessage({
      channel: session.channel,
      text: "Retrying " + summary.weakCards.length + " weak cards...",
      blocks: [{ type: 'header', text: { type: 'plain_text', text: "🔄 Retrying Weak Cards" } }]
    });
    const threadTs = result.ts;
    const newSession = updateSession(newSessionId, {
      sessionId: newSessionId, channel: session.channel, threadTs, title: "Retry: " + session.title,
      cards: [...summary.weakCards], currentIndex: 0, scores: [], completed: false
    });
    await postCard(newSession);
    res.json({ sessionId: newSessionId, threadTs });
  } catch (error) {
    console.error('Error retrying weak cards:', error);
    res.status(500).json({ error: error.message });
  }
});

async function postCard(session) {
  const card = session.cards[session.currentIndex];
  await app.client.chat.postMessage({
    channel: session.channel,
    thread_ts: session.threadTs,
    text: "Card " + (session.currentIndex + 1) + ": " + card.question,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: "*Card " + (session.currentIndex + 1) + " of " + session.cards.length + "*\n\n" + card.question }
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: ' 💡 _Reply to this thread with your answer_' }] }
    ]
  });
}

async function postSummary(sessionId, session) {
  updateSession(sessionId, { completed: true });
  const summary = buildSummaryData(session);
  const weakList = summary.weakCards.map(c => "• " + c.question).join("\n") || 'None!';
  await app.client.chat.postMessage({
    channel: session.channel,
    thread_ts: session.threadTs,
    text: "Session Complete! Score: " + summary.scorePercent + "%",
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏁 Session Complete' } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: "*Score:* " + summary.correct + " / " + summary.total + " (" + summary.scorePercent + "%)\n\n*Weak Cards:*\n" + weakList }
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: summary.weakCards.length > 0 ? ' 💡 _Tip: You can retry the weak cards to reinforce your knowledge._' : ' 🌟 _Perfect score! You are ready!_'
        }]
      }
    ]
  });
}

(async () => {
  const port = process.env.PORT || 3456;
  await app.start(port);
  console.log("⚡️ Flashcard app is running on port " + port);
})();
