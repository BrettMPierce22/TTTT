import { describe, expect, it } from "vitest";
import {
  getLegalHash,
  getLegalPageFromLocation,
  getPublicLegalUrl,
} from "./legalRoutes";

describe("legal routes", () => {
  it("opens every public policy from its signed-out hash URL", () => {
    expect(
      getLegalPageFromLocation({ pathname: "/", hash: "#/legal/privacy" })
    ).toBe("privacy");
    expect(
      getLegalPageFromLocation({ pathname: "/", hash: "#/legal/community" })
    ).toBe("community");
  });

  it("supports the permanent clean website URLs", () => {
    expect(getLegalPageFromLocation({ pathname: "/terms/", hash: "" })).toBe(
      "terms"
    );
    expect(getLegalPageFromLocation({ pathname: "/support/", hash: "" })).toBe(
      "support"
    );
  });

  it("falls back safely for unknown policy names", () => {
    expect(getLegalPageFromLocation({ pathname: "/unknown", hash: "" })).toBeNull();
    expect(getLegalHash("unknown")).toBe("#/legal/privacy");
    expect(getPublicLegalUrl("unknown")).toBe(
      "https://tabletalktabletennis.com/privacy/"
    );
  });
});
