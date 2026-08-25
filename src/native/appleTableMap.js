import { Capacitor, registerPlugin } from "@capacitor/core";

const AppleTableMap = registerPlugin("AppleTableMap");

export function canUseNativeAppleTableMap() {
  return Capacitor.getPlatform() === "ios";
}

export function presentNativeAppleTableMap(options) {
  return AppleTableMap.present(options);
}

export function onNativeAppleTableLocationSelected(listener) {
  return AppleTableMap.addListener("locationSelected", listener);
}

export function onNativeAppleTableAddRequested(listener) {
  return AppleTableMap.addListener("addLocationRequested", listener);
}
