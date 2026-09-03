import { Capacitor, registerPlugin } from "@capacitor/core";
const NativeShell = registerPlugin("NativeShell");

export async function shareReport(filename, csv) {
  if (!/^[a-zA-Z0-9-]+\.csv$/.test(filename)) throw new Error("Invalid report filename.");
  if (new TextEncoder().encode(csv).length > 2_000_000) {
    throw new Error("This report is too large. Choose a shorter period.");
  }
  if (Capacitor.getPlatform() === "ios") {
    return NativeShell.shareCsvReport({ filename, csv });
  }
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return { downloaded: true };
}
