# Marmot

Marmot is a private iOS and Android phone assistant: local models understand
shared content and propose useful, user-approved next actions on the phone.

North-star loop: share something -> understand it locally -> propose an action
-> get explicit approval -> execute it.

Primary user: a privacy-conscious phone user who wants useful help without an
account, cloud inference, or unapproved writes.

Current product surface: local chat, model library, share-to-quick-actions,
agent tools, voice, memory, and document/repository retrieval.

Product thesis: make the phone's existing compute feel more valuable than an
AI subscription. The viral wedge is a share-to-outcome loop: a person shares a
message, screenshot, receipt, or document; Marmot understands it locally; the
user sees a useful, editable preview; and one explicit tap completes the phone
action. The output should be easy to show another person while proving that the
content stayed on-device.

Priority filter: prefer frequent pain, a visible before/after transformation,
one-tap sharing or forwarding, local-model advantage, and zero unapproved side
effects. Provider OAuth and broad agent research are good-to-have Labs until
the local share-to-outcome loop has stronger completion and retention evidence.

## Small-model product strategy

Marmot should not compete with cloud assistants on unlimited knowledge or long
autonomous workflows. A small local model wins when the job is bounded, fast,
private, and available with no signal. The application supplies the structure
that keeps the model reliable: short task cards, local context, deterministic
parsers, and approval-gated phone writes.

The product has three complementary moments:

1. **Share to outcome** — share a screenshot, receipt, message, or document;
   extract the useful facts locally; show an editable preview; then offer a
   calendar event, reminder, reply draft, or saved note. This is the primary
   acquisition and productivity wedge because the before/after is visible and
   easy to demonstrate.
2. **Flight mode** — a deliberately offline session for a plane, commute, or
   weak-signal moment. Launch with a few bounded activities: language practice,
   explain-this, trip planning from saved material, choose-a-game, story
   continuation, and a short reflective check-in. Each activity keeps turns
   short, remembers only the current session unless the user saves it, and
   offers a clear Continue or Finish action. This gives the local model
   entertainment and emotional value without pretending it is a cloud-scale
   general agent.
3. **Private daily context** — opt-in local memories, projects, and saved
   documents make a modest model feel personal. Retrieval supplies the right
   facts; the model transforms them into a useful answer or draft. Nothing is
   uploaded and no side effect happens without approval.

4. **Always-available companion** — a local digital pet with a small evolving
   persona, private milestones, and gentle opt-in check-ins. It should feel
   alive inside Marmot, not secretly run as an unrestricted background process:
   the user chooses when it can notify, what it remembers, and when a milestone
   is saved. Growth comes from shared local moments, not surveillance.

### ROI order

| Rank | Bet | Why it earns its place | Success signal |
| --- | --- | --- | --- |
| 1 | Image/receipt to typed action | Strong aha moment, frequent pain, shareable, and now supported locally | useful extraction, accepted action, share/forward rate |
| 2 | Small-model task cards | Improves accuracy, latency, and clarity more cheaply than a larger model | first useful result time and edit rate |
| 3 | Flight mode MVP | Creates a memorable offline habit and differentiates from subscriptions; the bounded local session is now shipped | completed sessions and return after travel/offline use |
| 4 | Companion milestones | Adds emotional continuity without hidden background processing; requires explicit save and notification consent | saved milestones, opt-in check-ins, and return after travel/offline use |
| 5 | Local context and saved artifacts | Converts one-off novelty into trust and retention | grounded answers and saved-item reuse |
| 6 | Voice notes to decisions/actions | High utility, but needs more battery and native audio validation | transcript-to-action completion |

Keep provider OAuth, broad web research, MCP, and open-ended autonomous agent
work in Labs until the local loop has measured retention. The promise is
simple: the phone already has useful compute; Marmot makes it legible, safe,
and fun instead of selling more AI anxiety.
