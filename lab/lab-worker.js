// Web Worker of the AI Lab: plays one game per message.
import { playGame } from "./runner.js";

self.onmessage = (e) => {
  try {
    self.postMessage(playGame(e.data));
  } catch (err) {
    self.postMessage({ error: String(err && err.stack || err), id: e.data.id });
  }
};
