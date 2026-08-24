import { Capacitor, registerPlugin } from "@capacitor/core";

const NativeShell = registerPlugin("NativeShell");

export const NATIVE_TAB_NAMES = [
  "leaderboard",
  "tables",
  "record",
  "chat",
  "profile",
];

export function canUseNativeShell() {
  return Capacitor.getPlatform() === "ios";
}

export function listenForNativeTabSelection(listener) {
  return NativeShell.addListener("tabSelected", ({ tab }) => listener(tab));
}

export function setNativeTabsVisible(visible) {
  return NativeShell.setTabsVisible({ visible });
}

export function setSelectedNativeTab(tab) {
  return NativeShell.setSelectedTab({ tab });
}

export function setNativeTabBadge(tab, value) {
  return NativeShell.setTabBadge({ tab, value });
}
