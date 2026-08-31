import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountDeletionPanel from "./AccountDeletionPanel";

afterEach(cleanup);
function setup(overrides = {}) {
  const props = { expanded: true, busy: false, confirmation: "", error: "",
    onExpand: vi.fn(), onChange: vi.fn(), onDelete: vi.fn(), onClose: vi.fn(), onSupport: vi.fn(), ...overrides };
  render(<AccountDeletionPanel {...props} />);
  return props;
}
describe("account deletion confirmation", () => {
  it("expands without deleting anything", () => {
    const p = setup({ expanded: false });
    fireEvent.click(screen.getByRole("button", { name: "Delete My Account" }));
    expect(p.onExpand).toHaveBeenCalledOnce();
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it.each(["", "delete", "DELETE "])("does not accept confirmation %s", (confirmation) => {
    const p = setup({ confirmation });
    const button = screen.getByRole("button", { name: "Permanently Delete Account" });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(p.onDelete).not.toHaveBeenCalled();
  });
  it("submits only with exact confirmation", () => {
    const p = setup({ confirmation: "DELETE" });
    fireEvent.click(screen.getByRole("button", { name: "Permanently Delete Account" }));
    expect(p.onDelete).toHaveBeenCalledOnce();
  });
  it("blocks repeat actions and announces progress while busy", () => {
    const p = setup({ confirmation: "DELETE", busy: true });
    expect(screen.getByRole("status")).toHaveTextContent("Please keep this screen open");
    expect(screen.getByRole("textbox")).toBeDisabled();
    for (const button of screen.getAllByRole("button")) { expect(button).toBeDisabled(); fireEvent.click(button); }
    expect(p.onDelete).not.toHaveBeenCalled(); expect(p.onClose).not.toHaveBeenCalled();
  });
  it("shows retry errors accessibly and keeps support available", () => {
    const p = setup({ confirmation: "DELETE", error: "Deletion is incomplete. Please retry." });
    expect(screen.getByRole("alert")).toHaveTextContent("Please retry");
    expect(screen.getByRole("button", { name: "Permanently Delete Account" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Contact Support" }));
    expect(p.onSupport).toHaveBeenCalledOnce();
    expect(screen.getByText(/closing this panel does not cancel/i)).toBeInTheDocument();
  });
});
