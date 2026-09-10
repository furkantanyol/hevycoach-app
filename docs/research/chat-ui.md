# Chat UI for the app (researched 2026-09-10, primary sources)

## Pick: @assistant-ui/react-native 0.1.40 (MIT), published 2026-09-03, ~weekly releases
- Deps: assistant-stream, @assistant-ui/tap, @assistant-ui/core, @assistant-ui/store. All pure JS. Peers: react, react-native only. No reanimated / gesture-handler / keyboard-controller. Tarball has no ios/ or android/.
- Official example examples/with-expo pins react-native 0.86.3, expo ~57.0.20, expo-router ~57.0.19, newArchEnabled true. Exact match for our stack.
- Custom backend: `useLocalRuntime(adapter)` where adapter is `ChatModelAdapter` with `async *run({messages, abortSignal})`; every `yield {content:[{type:'text', text}]}` streams into the bubble. No Vercel AI SDK needed.
- History: `ThreadHistoryAdapter` `{ load(), append() }` for server-side history (needed: coach verdicts written server-side must appear in the thread).
- Styled Thread component: `npx assistant-ui@latest create --example with-expo <dir>` then copy `components/assistant-ui/elements/thread.aui.tsx`. Bare primitives are headless.
- Streaming caveat: RN global fetch cannot stream bodies; import `fetch` from `expo/fetch`. Server should stream raw text chunks (no SSE framing to parse).
- Risks: pre-1.0 churn; New Arch support inferred from the example, not stated.

## Rejected
- react-native-gifted-chat 3.4.0: npm-deprecated ("maintenance mode", moved to @kesha-antonov/react-native-chat); needs reanimated, gesture-handler, keyboard-controller.
- @kesha-antonov/react-native-chat 5.0.0: alive but drags flash-list, vision-camera, audio-api, true-sheet, svg + expo media peers. Heavier.
- @flyerhq/react-native-chat-ui 1.4.3: unmaintained since 2022.
- Hand-rolled FlatList+TextInput: runner-up; zero deps, ~150 lines, but re-implements streaming + keyboard handling.

Refs: https://www.assistant-ui.com/docs/react-native/custom-backend , /docs/react-native/adapters , https://github.com/assistant-ui/assistant-ui/blob/main/examples/with-expo/package.json
