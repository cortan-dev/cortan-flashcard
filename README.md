# cortan-flashcard

Slack flashcard app for interview prep.

## How it works (5-step flow)
1. **Initiate:** Cortan calls `POST /deck/create` with a list of cards.
2. **Setup:** The app creates a session, starts a Slack thread, and posts the first card.
3. **Response:** User replies to the thread with their answer.
4. **Scoring:** Cortan (or the user) evaluates the answer and calls `POST /deck/:sessionId/score`.
5. **Progression:** The app posts the feedback, reveals the correct answer, and advances to the next card until finished.

## Slack App Setup
Create a Slack App at `api.slack.com` and use the following manifest (YAML):

```yaml
display_information:
  name: Cortan Flashcard
features:
  bot_user:
    display_name: Flashcard
oauth_config:
  scopes:
    bot:
      - chat:write
      - chat:write.public
      - channels:read
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

## Install Steps
1. Clone the repo.
2. `npm install`
3. Copy `.env.example` to `.env` and fill in your Slack credentials.
4. `npm start`

## API Reference

### `POST /deck/create`
Creates a new flashcard session.
- **Body:** `{ "channel": "C123", "cards": [{ "question": "Q?", "answer": "A" }], "title": "Optional Title" }`
- **Returns:** `{ "sessionId": "uuid", "threadTs": "123.456" }`

### `POST /deck/:sessionId/score`
Scores the current card and moves to the next.
- **Body:** `{ "correct": true, "feedback": "Optional feedback" }`
- **Returns:** `{ "status": "ok" }`

### `GET /deck/:sessionId/summary`
Retrieves the session summary.
- **Returns:** `{ "correct": 5, "total": 10, "scorePercent": 50, "weakCards": [...] }`

### `POST /deck/:sessionId/retry-weak`
Starts a new session using only the cards marked incorrect in the previous session.
- **Returns:** `{ "sessionId": "new-uuid", "threadTs": "789.012" }`

## Session Storage
This version uses a flat JSON file at `data/sessions.json` for persistence. Not recommended for high-concurrency production but perfect for v1.

## How Cortan calls the API
Cortan acts as the orchestrator, feeding cards from its knowledge base into the API and potentially using an LLM to grade user responses before calling the `/score` endpoint.
