import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubscriptionPlansPanel from "./SubscriptionPlansPanel";

afterEach(cleanup);

describe("subscription plans panel", () => {
  it("shows all three plans without enabling charges before launch", () => {
    render(<SubscriptionPlansPanel planSummary={{ plan: "free" }} />);

    expect(screen.getByText("$1.99")).toBeInTheDocument();
    expect(screen.getByText("$4.99")).toBeInTheDocument();
    expect(screen.getByText(/cannot charge you/i)).toBeInTheDocument();
    const launchButtons = screen.getAllByRole("button", {
      name: "Available at launch",
    });
    expect(launchButtons).toHaveLength(2);
    for (const button of launchButtons) expect(button).toBeDisabled();
  });

  it("enables only a non-current paid tier after purchases are configured", () => {
    const onChoosePlan = vi.fn();
    render(
      <SubscriptionPlansPanel
        planSummary={{ plan: "plus" }}
        purchasesEnabled
        onChoosePlan={onChoosePlan}
      />
    );

    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    expect(onChoosePlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pro", price: "$4.99" })
    );
  });
});
