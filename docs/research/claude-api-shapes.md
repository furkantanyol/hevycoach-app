# Claude API shapes used by the server (from the claude-api skill, 2026-09-10)

- SDK: `@anthropic-ai/sdk`. `new Anthropic()` reads ANTHROPIC_API_KEY. Use SDK types (`Anthropic.MessageParam`, `Anthropic.Tool`, `Anthropic.ToolUseBlock`, `Anthropic.ToolResultBlockParam`, `Anthropic.Message`); never redefine them.
- Models: `claude-opus-5` (plan), `claude-sonnet-5` (chat, verdict). No date suffixes. Thinking is adaptive by default on Opus 5; on Sonnet 5 pass `thinking: { type: 'adaptive' }`. Never `budget_tokens`. `output_config: { effort: 'low' | 'medium' | 'high' }` tunes depth; use `low` or `medium` for chat and verdicts, `high` for the plan.
- `max_tokens`: ~16000 non-streaming, ~64000 streaming. Streaming for anything long.
- Streaming with tools (manual loop):
  ```ts
  const stream = client.messages.stream({ model, max_tokens: 64000, system, tools, messages });
  stream.on('text', (delta) => reply.raw.write(delta));
  const message = await stream.finalMessage();
  if (message.stop_reason === 'tool_use') {
    const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.ToolResultBlockParam[] = await Promise.all(calls.map(async (c) => ({ type: 'tool_result', tool_use_id: c.id, content: await run(c) })));
    messages.push({ role: 'user', content: results }); // loop again
  }
  ```
  Parse `tool_use.input` as JSON (never string-match). A failed tool returns `tool_result` with `is_error: true`.
- Tool definition with guaranteed-valid input: `{ name, description, strict: true, input_schema: { type: 'object', properties, required, additionalProperties: false } }`. `tool_choice: { type: 'auto' }` (default); forced tool choice is fine on Opus 5 / Sonnet 5.
- Structured output (plan, verdict): `client.messages.create({ ..., output_config: { format: { type: 'json_schema', schema } } })` then `JSON.parse` the text block. Schema needs `additionalProperties: false` everywhere and no `minimum`/`maximum`/`maxItems` keywords (400) — put ranges in `description` and validate after parsing. `client.messages.parse` + `zodOutputFormat` exists but needs zod; not used here.
- Prompt caching: system first and stable, `cache_control: { type: 'ephemeral' }` on the system block; volatile context (memory, last messages) after it.
- Errors: `Anthropic.RateLimitError`, `Anthropic.APIError` (status), `Anthropic.APIConnectionError`; check most specific first.
- Stop reasons: `end_turn`, `tool_use`, `max_tokens`, `refusal` (check `stop_details`).
- Never prefill an assistant turn (400 on current models).
