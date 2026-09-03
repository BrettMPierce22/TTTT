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
        storeProducts={{ pro: { productId: "com.tabletalktabletennis.app.leaguepro.monthly", displayPrice: "€4,99" } }}
        onChoosePlan={onChoosePlan}
      />
    );

    expect(screen.getByRole("button", { name: "Current plan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Choose Pro" }));
    expect(onChoosePlan).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pro", price: "€4,99" })
    );
  });

  it("does not offer a purchase using a missing or mismatched store price", () => {
    const choose = vi.fn();
    render(<SubscriptionPlansPanel planSummary={{ plan: "free" }} purchasesEnabled onChoosePlan={choose}
      storeProducts={{ plus: { productId: "wrong-product", displayPrice: "$0.01" } }} />);
    expect(screen.queryByText("$1.99")).not.toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: "Price unavailable" })) {
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(choose).not.toHaveBeenCalled();
  });

  it("blocks repeat purchases, restore, and manage actions while busy", () => {
    const restore = vi.fn(), manage = vi.fn(), choose = vi.fn();
    render(<SubscriptionPlansPanel planSummary={{ plan: "plus" }} purchasesEnabled busy
      storeProducts={{ pro: { productId: "com.tabletalktabletennis.app.leaguepro.monthly", displayPrice: "$4.99" } }}
      onChoosePlan={choose} onRestorePurchases={restore} onManageSubscription={manage} />);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled(); fireEvent.click(button);
    }
    expect(choose).not.toHaveBeenCalled(); expect(restore).not.toHaveBeenCalled(); expect(manage).not.toHaveBeenCalled();
  });
});
