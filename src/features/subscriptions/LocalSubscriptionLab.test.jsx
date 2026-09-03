import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LocalSubscriptionLab from "./LocalSubscriptionLab";
import { LOCAL_PRODUCT_IDS } from "./localStoreController";
afterEach(cleanup);

describe("local subscription lab", () => {
  it("requires explicit start and keeps test state visibly separate from real plans", async () => {
    const adapter = {
      start: vi.fn().mockResolvedValue({
        environment: "xcode-local", plan: "free",
        products: Object.entries(LOCAL_PRODUCT_IDS).map(([plan, productId]) => ({ plan, productId, displayPrice: "€2,00" })),
      }),
      purchase: vi.fn().mockResolvedValue({ environment: "xcode-local", plan: "plus", outcome: "purchased" }),
    };
    render(<LocalSubscriptionLab adapter={adapter} />);
    expect(adapter.start).not.toHaveBeenCalled();
    expect(screen.getByText(/never updates your/i)).toHaveTextContent("real plan");
    fireEvent.click(screen.getByRole("button", { name: "Start local Apple test store" }));
    fireEvent.click(await screen.findByRole("button", { name: "Test Plus · €2,00/month" }));
    expect(await screen.findByText("Simulated plan: Plus")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Plus · €2,00/month" })).toBeDisabled();
  });
  it("shows errors with a usable retry action", async () => {
    render(<LocalSubscriptionLab adapter={{ start: vi.fn().mockRejectedValue(new Error("Configuration missing")) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Start local Apple test store" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Configuration missing");
    expect(screen.getByRole("button", { name: "Start local Apple test store" })).toBeEnabled();
  });
});
