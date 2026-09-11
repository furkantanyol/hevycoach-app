#!/bin/sh
# Resets the coach's thread to the opener and relaunches the app on the simulator.
# Keeps the block (so the next plan updates the same routines), the push token and the webhook dedupe list.
set -e
cd "$(dirname "$0")/.."
node -e '
const fs = require("node:fs");
const path = "server/data/state.json";
const state = JSON.parse(fs.readFileSync(path, "utf8"));
Object.assign(state, { profile: null, messages: [], memory: "", intake: null, pendingProposal: null });
fs.writeFileSync(path, JSON.stringify(state, null, 2));
console.log("state reset; kept block:", state.block ? state.block.name : "none");
'
touch server/src/index.ts            # tsx watch restarts the dev server so it reloads the file
sleep 5
xcrun simctl terminate booted com.furkantanyol.hevycoach 2>/dev/null || true
xcrun simctl openurl booted "hevycoachapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
echo "app relaunched; the opener is written on its first load"
