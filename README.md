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
npm run build
npm run start
```

## Architecture overview

1. The **dispatcher** receives the conversation and latest user prompt.
2. The dispatcher generates a **structured task plan** with agent assignments.
3. Each **worker agent** executes its assigned task and returns a specialist report.
4. The dispatcher **synthesizes** the worker outputs into one final response.
5. The UI streams and visualizes each step as **graph state + event history**.
