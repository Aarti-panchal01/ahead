// Mode switch. Mock is the default; live only when YOUCAM_MODE=live and a key is set.
export type Mode = "mock" | "live";

export function mode(): Mode {
  return process.env.YOUCAM_MODE === "live" && process.env.YOUCAM_API_KEY ? "live" : "mock";
}

export * from "./mock";
export { messageFor } from "./messages";
