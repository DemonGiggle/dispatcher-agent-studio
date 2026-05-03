# Dispatcher Agent Studio

A TypeScript web app for **dispatcher-led multi-agent LLM orchestration**. The first model acts as the dispatcher, splits the user request into specialist tasks, routes them to worker agents, collects the reports, and synthesizes the final answer.

## What it includes

- **Chat-first workflow**: the user talks to the dispatcher through a web UI
- **Provider/model configuration**: each agent can use a different provider and model
- **Agent capability editor**: every worker declares its role, specialty, prompt, and visual identity
- **Graph visualization**: see which node is doing what, plus task routing between dispatcher and workers
- **Input/output inspector**: inspect each node's latest prompt, output, and event trail
- **Mock fallback**: if a provider API key is missing, the run falls back to a mock provider and surfaces a visible warning

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Vercel AI SDK
- React Flow (`@xyflow/react`)
- Zod

## Environment variables

Copy the example file and fill in whichever providers you want to use:

```bash
cp .env.example .env.local
```

```env
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_GENERATIVE_AI_API_KEY=
```

You can leave keys empty while iterating on the UI. The app will explicitly warn and use the mock provider for that node.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Available scripts

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run start
```

## Architecture overview

1. The **dispatcher** receives the conversation and latest user prompt.
2. The dispatcher generates a **structured task plan** with agent assignments.
3. Each **worker agent** executes its assigned task and returns a specialist report.
4. The dispatcher **synthesizes** the worker outputs into one final response.
5. The UI streams and visualizes each step as **graph state + event history**.

## Event stream schema

`/api/orchestrate` emits NDJSON events with schema version `2` in both the
`schemaVersion` field on every event and the
`X-Orchestration-Event-Schema-Version` response header.

Core event types:

- `run-start`
- `dispatcher-plan`
- `task-assignment`
- `node-status`
- `node-chunk`
- `agent-result`
- `final-response`
- `provider-warning`
- `run-complete`, `run-cancelled`, `run-error`

`node-chunk` preserves the raw chunk plus the aggregated output-so-far so the
UI can render live partial dispatcher and worker responses before the run
finishes.

## Persistence model

Studio state is persisted locally in the browser with a versioned storage record:

- **Autosaved**: current dispatcher config, agent team, conversation, and prompt draft
- **Explicitly saved**: named teams from the agent builder
- **Auto-recorded**: recent completed, cancelled, or failed runs with their messages and event log

The current storage key is `dispatcher-agent-studio:v1`. The persistence layer
uses a top-level `schemaVersion` field and a migration boundary in
`src/lib/studio-persistence.ts`. New versions should migrate older payloads into
the latest shape before the app hydrates client state.
