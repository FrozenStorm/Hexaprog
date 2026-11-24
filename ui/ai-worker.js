// Web Worker: computes the AI's orders off the main thread.
import { chooseOrders } from "../ai/ai.js";

self.onmessage = (e) => {
  const { id, state, player, level } = e.data;
  self.postMessage({ id, orders: chooseOrders(state, player, { level }) });
};
