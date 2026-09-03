import { Capacitor, registerPlugin } from "@capacitor/core";

export const LocalSubscriptionStore = registerPlugin("LocalSubscriptionStore");

export function canUseLocalSubscriptionStore() {
  // Only the DEBUG simulator binary registers this bridge. Web flags and
  // localStorage cannot switch it on for a website or Release/device build.
  return Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("LocalSubscriptionStore");
}
