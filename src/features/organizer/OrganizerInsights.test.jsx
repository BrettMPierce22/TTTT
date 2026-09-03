import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrganizerInsights from "./OrganizerInsights";
afterEach(cleanup);
const loadData = async ({ leagueId, days }) => ({ leagueId, days, players: [], matches: [], asOf: "2026-09-03T12:00:00Z" });
const props = { league: { id: "l", name: "My League" }, loadData, isAdmin: true };
const ready = () => waitFor(() => expect(screen.getByRole("button", { name: "Export player statistics" })).toBeEnabled());
describe("organizer insights", () => {
  it("is hidden from non-admin users", () => {
    render(<OrganizerInsights {...props} isAdmin={false} />);
    expect(screen.queryByText("League insights & reports")).not.toBeInTheDocument();
  });
  it("exports the chosen period and clearly labels the free preview", async () => {
    const exportReport = vi.fn().mockResolvedValue({ downloaded: true });
    render(<OrganizerInsights {...props} exportReport={exportReport} />);
    expect(screen.getByText(/FREE PREVIEW/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Report period" }), { target: { value: "all" } });
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export player statistics" }));
    await screen.findByText("Report download started.");
    expect(exportReport).toHaveBeenCalledWith(expect.stringContaining("-players-all-"), expect.stringContaining("Player"));
  });
  it("shows export failures without reporting success", async () => {
    render(<OrganizerInsights {...props} exportReport={vi.fn().mockRejectedValue(new Error("Share unavailable"))} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export match history" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Share unavailable");
    expect(screen.getByRole("button", { name: "Export match history" })).toBeEnabled();
  });
  it("never fetches reports for non-admins", () => {
    const loader = vi.fn();
    render(<OrganizerInsights {...props} loadData={loader} isAdmin={false} />);
    expect(loader).not.toHaveBeenCalled();
  });
  it("disables exports on loading failures and allows a retry", async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error("Connection failed")).mockImplementation(loadData);
    render(<OrganizerInsights {...props} loadData={loader} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection failed");
    expect(screen.getByRole("button", { name: "Export player statistics" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Load report" }));
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("blocks repeated export taps and reports share cancellation honestly", async () => {
    let finish;
    const exporter = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    render(<OrganizerInsights {...props} exportReport={exporter} />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export player statistics" }));
    fireEvent.click(screen.getByRole("button", { name: "Export match history" }));
    expect(exporter).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("combobox")).toBeDisabled();
    finish({ shared: false });
    await screen.findByText("Sharing cancelled.");
    expect(screen.queryByText("Report shared.")).not.toBeInTheDocument();
  });
  it("aborts the previous league's report when switching leagues", async () => {
    let oldRequest, finishOld;
    const loader = (request) => request.leagueId === "l"
      ? new Promise((resolve) => { oldRequest = request; finishOld = resolve; }) : loadData(request);
    const { rerender } = render(<OrganizerInsights {...props} loadData={loader} />);
    rerender(<OrganizerInsights {...props} league={{ id: "new", name: "New league" }} loadData={loader} />);
    expect(oldRequest.signal.aborted).toBe(true);
    finishOld(await loadData(oldRequest));
    await ready();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
