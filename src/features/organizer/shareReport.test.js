import { afterEach, describe, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ getPlatform: vi.fn(), shareCsvReport: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: native.getPlatform },
  registerPlugin: () => ({ shareCsvReport: native.shareCsvReport }),
}));
import { shareReport } from "./shareReport";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("report delivery", () => {
  it("opens the native iPhone share sheet, preserving cancellation", async () => {
    native.getPlatform.mockReturnValue("ios");
    native.shareCsvReport.mockResolvedValue({ shared: false });
    expect(await shareReport("League-matches.csv", "csv")).toEqual({ shared: false });
    expect(native.shareCsvReport).toHaveBeenCalledWith({ filename: "League-matches.csv", csv: "csv" });
  });
  it("creates and cleans up a browser download", async () => {
    native.getPlatform.mockReturnValue("web");
    vi.useFakeTimers();
    const createObjectURL = vi.fn().mockReturnValue("blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      expect(await shareReport("League-matches.csv", "csv")).toEqual({ downloaded: true });
      expect(click).toHaveBeenCalledTimes(1);
      expect(document.querySelector("a[download]")).toBeNull();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    } finally { vi.useRealTimers(); }
  });
  it("rejects path traversal and oversized reports before native or browser delivery", async () => {
    await expect(shareReport("../secrets.csv", "csv")).rejects.toThrow("filename");
    await expect(shareReport("League.csv", "a".repeat(2_000_001))).rejects.toThrow("too large");
    expect(native.shareCsvReport).not.toHaveBeenCalled();
  });
});
