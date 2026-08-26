import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppErrorBoundary from "./AppErrorBoundary";

function BrokenScreen() {
  throw new Error("Test screen failure");
}

describe("AppErrorBoundary", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps a broken screen from turning into a blank app", () => {
    render(
      <AppErrorBoundary>
        <BrokenScreen />
      </AppErrorBoundary>
    );

    expect(
      screen.getByRole("heading", { name: /couldn’t open this screen/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reopen table talk/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open support/i })).toHaveAttribute(
      "href",
      "https://tabletalktabletennis.com/support/"
    );
  });
});
