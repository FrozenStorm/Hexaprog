// Web Worker of the AI Lab: plays one game per message and, if asked, renders it
// as an animated GIF.
import { playGame } from "./runner.js";
import { renderGameGif } from "./render.js";

self.onmessage = (e) => {
  try {
    const res = playGame(e.data);
    if (e.data.gif && typeof OffscreenCanvas !== "undefined") {
      try { res.gif = renderGameGif(res.replay); } catch (err) { res.gifError = String(err); }
    }
    self.postMessage(res, res.gif ? [res.gif.buffer] : []);
  } catch (err) {
    self.postMessage({ error: String(err && err.stack || err), id: e.data.id });
  }
};
