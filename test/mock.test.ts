import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES, findRecording, messageFor, mockTaskId, mode, readMock } from "@/lib/youcam";

describe("mock mode", () => {
  it("is the default", () => {
    expect(mode()).toBe("mock");
  });
  it("replays a recorded wig try-on as success with a result image", () => {
    const rec = findRecording("F2", "W1");
    expect(rec).toBe("p1__F2__W1");
    const s = readMock(mockTaskId(rec!));
    expect(s?.status).toBe("success");
    expect(s?.resultUrl).toBe("/api/fixtures/p1__F2__W1");
  });
  it("replays a mannequin photo as error_no_face with a plain message", () => {
    const s = readMock(mockTaskId(findRecording("F1", "W5")!));
    expect(s).toMatchObject({ status: "error", errorCode: "error_no_face" });
    expect(messageFor(s!.errorCode)).toMatch(/person wearing/);
  });
  it("refuses unsafe names and unknown combinations", () => {
    expect(findRecording("../x", "W1")).toBeNull();
    expect(findRecording("F7", "W1")).toBeNull();
    expect(readMock("mock:../../etc")).toBeNull();
  });
  it("contains no private selfies (S1-S3)", () => {
    for (const f of fs.readdirSync(FIXTURES)) expect(f).not.toMatch(/__S\d/);
    for (const f of fs.readdirSync(FIXTURES).filter((x) => x.endsWith(".json"))) {
      expect(fs.readFileSync(path.join(FIXTURES, f), "utf8")).not.toMatch(/amazonaws\.com|X-Amz-Signature/);
    }
  });
});
