import { Capacitor, registerPlugin } from "@capacitor/core";

const AddressGeocoder = registerPlugin("AddressGeocoder");

export function canUseAppleAddressLookup() {
  return Capacitor.getPlatform() === "ios";
}

export function geocodeAddressWithApple(address) {
  return AddressGeocoder.geocode({ address });
}

export function suggestAddressesWithApple(query) {
  return AddressGeocoder.suggest({ query });
}

export function resolveAppleAddressSuggestion(id) {
  return AddressGeocoder.resolveSuggestion({ id });
}

export function reverseGeocodeWithApple(latitude, longitude) {
  return AddressGeocoder.reverseGeocode({ latitude, longitude });
}
