import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./TableLocator.css";
import { supabase } from "../../lib/supabaseClient";
import {
  canUseAppleAddressLookup,
  geocodeAddressWithApple,
  resolveAppleAddressSuggestion,
  reverseGeocodeWithApple,
  suggestAddressesWithApple,
} from "../../native/addressGeocoder";
import {
  canUseNativeAppleTableMap,
  completeNativeAppleTableContribution,
  onNativeAppleTableAddRequested,
  onNativeAppleTableContributionSubmitted,
  onNativeAppleTableLocationSelected,
  presentNativeAppleTableMap,
} from "../../native/appleTableMap";

const DEFAULT_CENTER = [39.8283, -98.5795];
const MAX_TABLE_PHOTO_BYTES = 5 * 1024 * 1024;
const TABLE_PHOTO_BUCKET = "table-location-photos";
const TABLE_EDIT_SUGGESTION_PREFIX = "TTTT_EDIT_SUGGESTION_V1:";
const TABLE_PHOTO_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const US_STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};
const US_STATE_CODES = Object.fromEntries(
  Object.entries(US_STATE_NAMES).map(([code, name]) => [name.toLowerCase(), code])
);

const tableMarker = L.divIcon({
  className: "table-map-marker-shell",
  html: '<span class="table-map-marker" aria-hidden="true">🏓</span>',
  iconAnchor: [20, 20],
  iconSize: [40, 40],
  popupAnchor: [0, -18],
});

const EMPTY_LOCATION_FORM = {
  name: "",
  address: "",
  city: "",
  region: "",
  postalCode: "",
  latitude: "",
  longitude: "",
  venueType: "park",
  accessType: "free",
  indoor: false,
  tableCount: "1",
  hoursText: "",
  notes: "",
  websiteUrl: "",
  publicConfirmation: false,
};

function MapFocus({ center, zoom }) {
  const map = useMap();
  const latitude = center[0];
  const longitude = center[1];

  useEffect(() => {
    map.flyTo([latitude, longitude], zoom, { duration: 0.65 });
  }, [latitude, longitude, map, zoom]);

  return null;
}

function MapPinSelector({ onSelect }) {
  useMapEvents({
    click(event) {
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMiles(from, to) {
  if (!from || !to) return null;

  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(a));
}

function parseCoordinate(value) {
  if (String(value ?? "").trim() === "") return null;

  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
}

function base64ToBlob(base64, contentType) {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: contentType });
}

function formatVenueType(value) {
  const labels = {
    park: "Park",
    community_center: "Community center",
    club: "Table tennis club",
    bar_restaurant: "Bar or restaurant",
    school: "School or campus",
    other: "Other public venue",
  };

  return labels[value] || labels.other;
}

function formatAccessType(value) {
  const labels = {
    free: "Free",
    paid: "Fee required",
    members: "Members only",
    unknown: "Access unknown",
  };

  return labels[value] || labels.unknown;
}

function formatRegionSearchTerms(value) {
  const region = String(value || "").trim();
  const upperRegion = region.toUpperCase();
  const stateName = US_STATE_NAMES[upperRegion];
  const stateCode = US_STATE_CODES[region.toLowerCase()];

  return [region, stateName, stateCode].filter(Boolean).join(" ");
}

function TableLocator({ userId }) {
  const [locations, setLocations] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [userPosition, setUserPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectingSuggestion, setSelectingSuggestion] = useState(false);
  const [suggestionsAttempted, setSuggestionsAttempted] = useState(false);
  const [reverseGeocoding, setReverseGeocoding] = useState(false);
  const [locationPhoto, setLocationPhoto] = useState(null);
  const [locationPhotoPreview, setLocationPhotoPreview] = useState("");
  const [photoUrlsByPath, setPhotoUrlsByPath] = useState({});
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [locationForm, setLocationForm] = useState(EMPTY_LOCATION_FORM);
  const [reviewForm, setReviewForm] = useState({
    rating: 5,
    title: "",
    body: "",
  });
  const [reportTarget, setReportTarget] = useState(null);
  const [reportForm, setReportForm] = useState({
    reason: "incorrect",
    details: "",
  });
  const [photoSuggestionTarget, setPhotoSuggestionTarget] = useState(null);
  const [photoSuggestionFile, setPhotoSuggestionFile] = useState(null);
  const [photoSuggestionPreview, setPhotoSuggestionPreview] = useState("");
  const addressSuggestionTimerRef = useRef(null);
  const addressSuggestionRequestRef = useRef(0);
  const locationFormRef = useRef(null);

  useEffect(
    () => () => {
      window.clearTimeout(addressSuggestionTimerRef.current);
    },
    []
  );

  useEffect(
    () => () => {
      if (locationPhotoPreview) URL.revokeObjectURL(locationPhotoPreview);
    },
    [locationPhotoPreview]
  );

  useEffect(
    () => () => {
      if (photoSuggestionPreview) URL.revokeObjectURL(photoSuggestionPreview);
    },
    [photoSuggestionPreview]
  );

  const loadLocatorData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setErrorMessage("");

    const [moderatorResult, locationResult, reviewResult, blockResult] =
      await Promise.all([
        supabase
          .from("table_locator_moderators")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("table_locations")
          .select(
            "id,name,address,city,region,postal_code,latitude,longitude,venue_type,access_type,indoor,table_count,hours_text,notes,website_url,photo_path,submitted_by,status,last_verified_at,source_name,source_url,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("table_location_reviews")
          .select(
            "id,location_id,user_id,rating,title,body,status,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("table_locator_blocks")
          .select("blocked_user_id")
          .eq("blocker_id", userId),
      ]);

    const firstError =
      locationResult.error ||
      reviewResult.error ||
      moderatorResult.error ||
      blockResult.error;

    if (firstError) {
      console.error("Could not load the table locator", firstError);
      setErrorMessage(
        firstError.code === "42P01"
          ? "The table locator database migration still needs to be installed."
          : "The table locator could not be loaded. Please try again."
      );
      setLoading(false);
      return;
    }

    const nextLocations = locationResult.data || [];
    const photoPaths = nextLocations
      .map((location) => location.photo_path)
      .filter(Boolean);
    const nextPhotoUrls = {};

    if (photoPaths.length > 0) {
      const { data: signedPhotos, error: photoError } = await supabase.storage
        .from(TABLE_PHOTO_BUCKET)
        .createSignedUrls(photoPaths, 3600);

      if (photoError) {
        console.error("Could not load table photos", photoError);
      } else {
        (signedPhotos || []).forEach((photo) => {
          if (photo.path && photo.signedUrl) {
            nextPhotoUrls[photo.path] = photo.signedUrl;
          }
        });
      }
    }

    setIsModerator(Boolean(moderatorResult.data));
    setLocations(nextLocations);
    setPhotoUrlsByPath(nextPhotoUrls);
    setReviews(reviewResult.data || []);
    setBlockedUserIds(
      (blockResult.data || []).map((item) => item.blocked_user_id)
    );

    setSelectedLocationId((current) => {
      if (
        current &&
        nextLocations.some(
          (location) => location.id === current && location.status === "approved"
        )
      ) {
        return current;
      }

      return null;
    });
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadLocatorData();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLocatorData]);

  const approvedLocations = useMemo(
    () => locations.filter((location) => location.status === "approved"),
    [locations]
  );

  const approvedReviews = useMemo(
    () =>
      reviews.filter(
        (review) =>
          review.status === "approved" &&
          !blockedUserIds.includes(review.user_id)
      ),
    [blockedUserIds, reviews]
  );

  const ratingsByLocation = useMemo(() => {
    return approvedReviews.reduce((totals, review) => {
      const current = totals[review.location_id] || { total: 0, count: 0 };
      totals[review.location_id] = {
        total: current.total + Number(review.rating),
        count: current.count + 1,
      };
      return totals;
    }, {});
  }, [approvedReviews]);

  const visibleLocations = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return approvedLocations
      .filter((location) => {
        if (quickFilter === "free" && location.access_type !== "free") {
          return false;
        }
        if (quickFilter === "indoor" && !location.indoor) {
          return false;
        }
        if (quickFilter === "outdoor" && location.indoor) {
          return false;
        }

        if (!normalizedQuery) return true;

        return [
          location.name,
          location.address,
          location.city,
          formatRegionSearchTerms(location.region),
          location.postal_code,
          formatVenueType(location.venue_type),
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      })
      .map((location) => ({
        ...location,
        distance: distanceInMiles(userPosition, location),
      }))
      .sort((a, b) => {
        if (a.distance == null || b.distance == null) {
          return a.name.localeCompare(b.name);
        }
        return a.distance - b.distance;
      });
  }, [approvedLocations, query, quickFilter, userPosition]);

  const selectedLocation = useMemo(
    () =>
      visibleLocations.find(
        (location) => location.id === selectedLocationId
      ) || null,
    [selectedLocationId, visibleLocations]
  );

  const editingLocation = useMemo(
    () =>
      locations.find((location) => location.id === editingLocationId) || null,
    [editingLocationId, locations]
  );

  const canEditLocationPhoto =
    !editingLocation || editingLocation.submitted_by === userId;

  const selectedReviews = useMemo(
    () =>
      approvedReviews.filter(
        (review) => review.location_id === selectedLocation?.id
      ),
    [approvedReviews, selectedLocation?.id]
  );

  const myPendingLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          location.submitted_by === userId && location.status === "pending"
      ),
    [locations, userId]
  );

  const openNativeAppleMap = useCallback(async () => {
    if (!canUseNativeAppleTableMap()) return;

    try {
      await presentNativeAppleTableMap({
        locations: approvedLocations.map((location) => {
          const rating = ratingsByLocation[location.id];
          return {
            id: location.id,
            name: location.name,
            address: location.address,
            city: location.city,
            region: location.region,
            postalCode: location.postal_code || "",
            latitude: Number(location.latitude),
            longitude: Number(location.longitude),
            venueType: location.venue_type,
            accessType: location.access_type,
            indoor: Boolean(location.indoor),
            tableCount: Number(location.table_count || 1),
            rating: rating ? rating.total / rating.count : null,
            hoursText: location.hours_text || "",
            notes: location.notes || "",
            websiteUrl: location.website_url || "",
            lastVerifiedAt: location.last_verified_at || "",
            sourceName: location.source_name || "",
            sourceUrl: location.source_url || "",
          };
        }),
        selectedLocationId: selectedLocationId || undefined,
        userLatitude: userPosition?.latitude,
        userLongitude: userPosition?.longitude,
      });
    } catch (error) {
      console.error("Could not open the native Apple map", error);
      setErrorMessage("The Apple map could not be opened. The table list is still available below.");
    }
  }, [approvedLocations, ratingsByLocation, selectedLocationId, userPosition]);

  const handleNativeContributionSubmission = useCallback(
    async ({
      action,
      id,
      requestId,
      rating,
      title,
      details,
      reason,
      photoBase64,
      contentType,
      proposedChanges,
    }) => {
      let success = false;
      let message = "That submission could not be sent. Please try again.";
      let uploadedPhotoPath = null;

      try {
        if (!requestId || !id) {
          throw new Error("The contribution request was incomplete.");
        }

        if (action === "review") {
          const { error } = await supabase.from("table_location_reviews").insert({
            location_id: id,
            user_id: userId,
            rating: Number(rating) || 5,
            title: String(title || "").trim() || null,
            body: String(details || "").trim() || null,
            status: "pending",
          });

          if (error) {
            if (error.code === "23505") {
              message = "You already submitted a rating for this location.";
            }
            throw error;
          }
          success = true;
          message = "Your review is awaiting moderation before it appears publicly.";
        } else if (action === "edit") {
          const encodedSuggestion = `${TABLE_EDIT_SUGGESTION_PREFIX}${JSON.stringify({
            changes: proposedChanges,
          })}`;

          if (
            !proposedChanges ||
            typeof proposedChanges !== "object" ||
            Object.keys(proposedChanges).length === 0
          ) {
            throw new Error("No listing changes were included.");
          }
          if (encodedSuggestion.length > 1000) {
            message = "That suggestion is too long. Shorten the notes and try again.";
            throw new Error(message);
          }

          const { error } = await supabase.from("table_location_reports").insert({
            location_id: id,
            review_id: null,
            reporter_id: userId,
            reason: "incorrect",
            details: encodedSuggestion,
            status: "open",
          });

          if (error) throw error;
          success = true;
          message = "Thanks! A moderator can review and apply your suggested changes.";
        } else if (action === "report") {
          const correction = String(details || "").trim();
          const { error } = await supabase.from("table_location_reports").insert({
            location_id: id,
            review_id: null,
            reporter_id: userId,
            reason: reason || "other",
            details: correction || null,
            status: "open",
          });

          if (error) throw error;
          success = true;
          message = "Report received. We’ll review it as soon as possible.";
        } else if (action === "photo") {
          const resolvedContentType = contentType || "image/jpeg";
          const photo = base64ToBlob(String(photoBase64 || ""), resolvedContentType);

          if (!photo.size || photo.size > MAX_TABLE_PHOTO_BYTES) {
            throw new Error("The selected photo is missing or larger than 5 MB.");
          }

          const submissionId = crypto.randomUUID();
          uploadedPhotoPath = `${userId}/${id}/${submissionId}.jpg`;
          const { error: uploadError } = await supabase.storage
            .from(TABLE_PHOTO_BUCKET)
            .upload(uploadedPhotoPath, photo, {
              cacheControl: "3600",
              contentType: resolvedContentType,
              upsert: false,
            });

          if (uploadError) throw uploadError;

          const { error } = await supabase
            .from("table_location_photo_submissions")
            .insert({
              id: submissionId,
              location_id: id,
              contributor_id: userId,
              photo_path: uploadedPhotoPath,
              status: "pending",
            });

          if (error) {
            await supabase.storage.from(TABLE_PHOTO_BUCKET).remove([uploadedPhotoPath]);
            uploadedPhotoPath = null;
            throw error;
          }
          success = true;
          message = "Thanks! Your photo is private while a moderator reviews it.";
        } else {
          throw new Error("That contribution type is not supported.");
        }
      } catch (error) {
        console.error("Could not submit native table contribution", error);
        if (uploadedPhotoPath) {
          await supabase.storage.from(TABLE_PHOTO_BUCKET).remove([uploadedPhotoPath]);
        }
        if (error?.message?.includes("larger than 5 MB")) {
          message = error.message;
        }
      }

      try {
        await completeNativeAppleTableContribution({ requestId, success, message });
      } catch (error) {
        console.error("Could not finish the native contribution flow", error);
      }

      if (success) {
        await loadLocatorData();
      }
    },
    [loadLocatorData, userId]
  );

  useEffect(() => {
    if (!canUseNativeAppleTableMap()) return undefined;

    let cancelled = false;
    const handles = [];

    Promise.all([
      onNativeAppleTableLocationSelected(({ id }) => {
        setSelectedLocationId(id);
        window.setTimeout(() => {
          document.querySelector(".locator-detail-card")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 180);
      }),
      onNativeAppleTableAddRequested(() => {
        setEditingLocationId(null);
        setLocationForm(EMPTY_LOCATION_FORM);
        setRemoveExistingPhoto(false);
        setAddressSuggestions([]);
        setSuggestionsAttempted(false);
        setLocationPhoto(null);
        setLocationPhotoPreview("");
        setShowSubmissionForm(true);
        window.setTimeout(() => {
          locationFormRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 180);
      }),
      onNativeAppleTableContributionSubmitted(handleNativeContributionSubmission),
    ]).then((nextHandles) => {
      if (cancelled) {
        nextHandles.forEach((handle) => handle.remove());
      } else {
        handles.push(...nextHandles);
      }
    });

    return () => {
      cancelled = true;
      handles.forEach((handle) => handle.remove());
    };
  }, [handleNativeContributionSubmission]);

  function updateLocationForm(field, value) {
    const addressFields = ["address", "city", "region", "postalCode"];

    if (addressFields.includes(field)) {
      setNotice("");
    }

    setLocationForm((current) => ({
      ...current,
      [field]: value,
      ...(addressFields.includes(field)
        ? { latitude: "", longitude: "" }
        : {}),
    }));
  }

  function canManageLocation(location) {
    return Boolean(
      location && (isModerator || location.submitted_by === userId)
    );
  }

  function showWebLocationDetails(locationId, { toggle = false } = {}) {
    if (toggle && selectedLocationId === locationId) {
      setSelectedLocationId(null);
      return;
    }

    setSelectedLocationId(locationId);
    window.setTimeout(() => {
      document.querySelector(".locator-detail-card")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 100);
  }

  function resetLocationEditor() {
    setEditingLocationId(null);
    setLocationForm(EMPTY_LOCATION_FORM);
    setRemoveExistingPhoto(false);
    setAddressSuggestions([]);
    setSuggestionsAttempted(false);
    clearLocationPhoto();
  }

  function closeLocationForm() {
    resetLocationEditor();
    setShowSubmissionForm(false);
  }

  function startEditingLocation(location) {
    if (!canManageLocation(location)) return;

    setEditingLocationId(location.id);
    setLocationForm({
      name: location.name || "",
      address: location.address || "",
      city: location.city || "",
      region: location.region || "",
      postalCode: location.postal_code || "",
      latitude: String(location.latitude ?? ""),
      longitude: String(location.longitude ?? ""),
      venueType: location.venue_type || "other",
      accessType: location.access_type || "unknown",
      indoor: Boolean(location.indoor),
      tableCount: String(location.table_count || 1),
      hoursText: location.hours_text === "N/A" ? "" : location.hours_text || "",
      notes: location.notes === "N/A" ? "" : location.notes || "",
      websiteUrl: location.website_url || "",
      publicConfirmation: true,
    });
    setLocationPhoto(null);
    setLocationPhotoPreview(
      location.photo_path ? photoUrlsByPath[location.photo_path] || "" : ""
    );
    setRemoveExistingPhoto(false);
    setAddressSuggestions([]);
    setErrorMessage("");
    setNotice("");
    setShowSubmissionForm(true);

    window.setTimeout(() => {
      locationFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function setSubmissionPin(latitude, longitude) {
    setLocationForm((current) => ({
      ...current,
      latitude: Number(latitude).toFixed(6),
      longitude: Number(longitude).toFixed(6),
    }));
  }

  function applyResolvedAddress(result) {
    const latitude = Number(result.latitude);
    const longitude = Number(result.longitude);

    setLocationForm((current) => ({
      ...current,
      address: result.street?.trim() || current.address,
      city: result.city?.trim() || current.city,
      region: result.region?.trim() || current.region,
      postalCode: result.postalCode?.trim() || current.postalCode,
      latitude: Number.isFinite(latitude)
        ? latitude.toFixed(6)
        : current.latitude,
      longitude: Number.isFinite(longitude)
        ? longitude.toFixed(6)
        : current.longitude,
    }));
  }

  function handleStreetAddressChange(value) {
    updateLocationForm("address", value);
    setAddressSuggestions([]);
    setSuggestionsAttempted(false);
    window.clearTimeout(addressSuggestionTimerRef.current);

    const requestId = addressSuggestionRequestRef.current + 1;
    addressSuggestionRequestRef.current = requestId;

    const query = value.trim();
    if (!canUseAppleAddressLookup() || query.length < 3) {
      setLoadingSuggestions(false);
      return;
    }

    setLoadingSuggestions(true);

    addressSuggestionTimerRef.current = window.setTimeout(async () => {
      try {
        const result = await suggestAddressesWithApple(query);
        if (addressSuggestionRequestRef.current !== requestId) return;

        setAddressSuggestions(result.suggestions || []);
        setSuggestionsAttempted(true);
      } catch (error) {
        console.error("Could not load Apple address suggestions", error);
        if (addressSuggestionRequestRef.current === requestId) {
          setAddressSuggestions([]);
          setSuggestionsAttempted(true);
        }
      } finally {
        if (addressSuggestionRequestRef.current === requestId) {
          setLoadingSuggestions(false);
        }
      }
    }, 320);
  }

  async function selectAddressSuggestion(suggestion) {
    addressSuggestionRequestRef.current += 1;
    window.clearTimeout(addressSuggestionTimerRef.current);
    setSelectingSuggestion(true);
    setLoadingSuggestions(false);
    setSuggestionsAttempted(false);
    setErrorMessage("");
    setNotice("");
    setAddressSuggestions([]);
    setLocationForm((current) => ({
      ...current,
      address: suggestion.title || current.address,
    }));

    try {
      const result = await resolveAppleAddressSuggestion(suggestion.id);
      applyResolvedAddress(result);
      setNotice("Address filled from Apple Maps. Drag the pin if it needs adjustment.");
    } catch (error) {
      console.error("Could not select Apple address suggestion", error);
      setErrorMessage(
        error?.message || "Apple Maps could not open that address suggestion."
      );
    } finally {
      setSelectingSuggestion(false);
    }
  }

  async function setSubmissionPinAndLookup(latitude, longitude) {
    setSubmissionPin(latitude, longitude);
    setAddressSuggestions([]);

    if (!canUseAppleAddressLookup()) return;

    setReverseGeocoding(true);
    setErrorMessage("");

    try {
      const result = await reverseGeocodeWithApple(latitude, longitude);
      applyResolvedAddress(result);
      setNotice("Address updated from the map pin.");
    } catch (error) {
      console.error("Could not find an address for the pin", error);
      setErrorMessage(
        error?.message ||
          "The pin was placed, but Apple Maps could not find its street address."
      );
    } finally {
      setReverseGeocoding(false);
    }
  }

  function handleLocationPhotoChange(event) {
    const file = event.target.files?.[0] || null;
    setErrorMessage("");

    if (!file) {
      setLocationPhoto(null);
      setLocationPhotoPreview("");
      return;
    }

    if (!TABLE_PHOTO_TYPES[file.type]) {
      setErrorMessage("Table photos must be JPEG, PNG, or WebP files.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_TABLE_PHOTO_BYTES) {
      setErrorMessage("Table photos must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    setLocationPhoto(file);
    setLocationPhotoPreview(URL.createObjectURL(file));
    setRemoveExistingPhoto(false);
  }

  function clearLocationPhoto() {
    setLocationPhoto(null);
    setLocationPhotoPreview("");
  }

  function removeLocationPhoto() {
    clearLocationPhoto();
    if (editingLocation?.photo_path) {
      setRemoveExistingPhoto(true);
    }
  }

  function closePhotoSuggestion() {
    setPhotoSuggestionTarget(null);
    setPhotoSuggestionFile(null);
    setPhotoSuggestionPreview("");
  }

  function handlePhotoSuggestionChange(event) {
    const file = event.target.files?.[0] || null;
    setErrorMessage("");

    if (!file) {
      setPhotoSuggestionFile(null);
      setPhotoSuggestionPreview("");
      return;
    }

    if (!TABLE_PHOTO_TYPES[file.type]) {
      setErrorMessage("Table photos must be JPEG, PNG, or WebP files.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_TABLE_PHOTO_BYTES) {
      setErrorMessage("Table photos must be smaller than 5 MB.");
      event.target.value = "";
      return;
    }

    setPhotoSuggestionFile(file);
    setPhotoSuggestionPreview(URL.createObjectURL(file));
  }

  async function submitPhotoSuggestion(event) {
    event.preventDefault();
    if (!photoSuggestionTarget || !photoSuggestionFile) return;

    setSaving(true);
    setErrorMessage("");
    setNotice("");

    const submissionId = crypto.randomUUID();
    const extension = TABLE_PHOTO_TYPES[photoSuggestionFile.type];
    const photoPath = `${userId}/${photoSuggestionTarget.id}/${submissionId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(TABLE_PHOTO_BUCKET)
      .upload(photoPath, photoSuggestionFile, {
        cacheControl: "3600",
        contentType: photoSuggestionFile.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Could not upload suggested table photo", uploadError);
      setErrorMessage("That photo could not be uploaded. Please try again.");
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("table_location_photo_submissions")
      .insert({
        id: submissionId,
        location_id: photoSuggestionTarget.id,
        contributor_id: userId,
        photo_path: photoPath,
        status: "pending",
      });

    if (error) {
      console.error("Could not submit suggested table photo", error);
      await supabase.storage.from(TABLE_PHOTO_BUCKET).remove([photoPath]);
      setErrorMessage(
        error.code === "42P01" || error.code === "PGRST205"
          ? "The secure photo-approval update is prepared but still needs approval."
          : "That photo could not be sent for review."
      );
      setSaving(false);
      return;
    }

    closePhotoSuggestion();
    setNotice("Thanks! Your photo is private while a moderator reviews it.");
    setSaving(false);
  }

  function getCompleteAddress() {
    return [
      locationForm.address,
      locationForm.city,
      locationForm.region,
      locationForm.postalCode,
    ]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(", ");
  }

  function hasCompleteAddress() {
    return [
      locationForm.address,
      locationForm.city,
      locationForm.region,
      locationForm.postalCode,
    ].every((part) => part.trim());
  }

  async function findAddressOnMap({ showNotice = true } = {}) {
    setErrorMessage("");
    setNotice("");

    if (!hasCompleteAddress()) {
      setErrorMessage(
        "Enter the street address, city, state or region, and ZIP or postal code first."
      );
      return null;
    }

    if (!canUseAppleAddressLookup()) {
      setErrorMessage(
        "Automatic Apple Maps address lookup is available in the iPhone app. On the website, tap the map to place the pin."
      );
      return null;
    }

    setGeocoding(true);

    try {
      const result = await geocodeAddressWithApple(getCompleteAddress());
      const latitude = Number(result.latitude);
      const longitude = Number(result.longitude);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Apple Maps did not return a valid location.");
      }

      applyResolvedAddress(result);
      if (showNotice) {
        setNotice("Pin placed from Apple Maps. Tap or drag it to fine-tune the location.");
      }
      return { latitude, longitude };
    } catch (error) {
      console.error("Could not look up address", error);
      setErrorMessage(
        error?.message ||
          "Apple Maps could not find that address. Check it or place the pin manually."
      );
      return null;
    } finally {
      setGeocoding(false);
    }
  }

  function requestUserPosition({ fillSubmission = false } = {}) {
    if (!navigator.geolocation) {
      setErrorMessage("Location services are not available on this device.");
      return;
    }

    setLocating(true);
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setUserPosition(nextPosition);
        if (fillSubmission) {
          setSubmissionPinAndLookup(
            nextPosition.latitude,
            nextPosition.longitude
          );
        }
        setLocating(false);
      },
      () => {
        setErrorMessage(
          "We could not access your location. Enter the address and place the pin on the map instead."
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function submitLocation(event) {
    event.preventDefault();
    setErrorMessage("");
    setNotice("");

    let latitude = parseCoordinate(locationForm.latitude);
    let longitude = parseCoordinate(locationForm.longitude);

    if (!locationForm.publicConfirmation) {
      setErrorMessage(
        "Confirm that this is a publicly accessible venue and not a private residence."
      );
      return;
    }

    if (!hasCompleteAddress()) {
      setErrorMessage(
        "Street address, city, state or region, and ZIP or postal code are all required."
      );
      return;
    }

    if (latitude == null || longitude == null) {
      const foundLocation = await findAddressOnMap({ showNotice: false });
      if (!foundLocation) return;

      latitude = foundLocation.latitude;
      longitude = foundLocation.longitude;
    }

    const locationBeingEdited = editingLocationId
      ? locations.find((location) => location.id === editingLocationId)
      : null;

    if (editingLocationId && !canManageLocation(locationBeingEdited)) {
      setErrorMessage("You do not have permission to edit this location.");
      return;
    }

    if (
      locationBeingEdited &&
      locationBeingEdited.submitted_by !== userId &&
      locationPhoto
    ) {
      setErrorMessage("Only the original submitter can replace this photo.");
      return;
    }

    setSaving(true);
    const locationId = locationBeingEdited?.id || crypto.randomUUID();
    const previousPhotoPath = locationBeingEdited?.photo_path || null;
    let photoPath = removeExistingPhoto ? null : previousPhotoPath;
    let uploadedPhotoPath = null;

    if (locationPhoto) {
      const extension = TABLE_PHOTO_TYPES[locationPhoto.type];
      uploadedPhotoPath = `${userId}/${locationId}/table.${extension}`;
      photoPath = uploadedPhotoPath;

      const { error: uploadError } = await supabase.storage
        .from(TABLE_PHOTO_BUCKET)
        .upload(uploadedPhotoPath, locationPhoto, {
          cacheControl: "3600",
          contentType: locationPhoto.type,
          upsert: uploadedPhotoPath === previousPhotoPath,
        });

      if (uploadError) {
        console.error("Could not upload table photo", uploadError);
        setErrorMessage(
          "The table photo could not be uploaded. Confirm the photo migration is installed and try again."
        );
        setSaving(false);
        return;
      }
    }

    const locationValues = {
      name: locationForm.name.trim(),
      address: locationForm.address.trim(),
      city: locationForm.city.trim(),
      region: locationForm.region.trim(),
      postal_code: locationForm.postalCode.trim(),
      latitude,
      longitude,
      venue_type: locationForm.venueType,
      access_type: locationForm.accessType,
      indoor: locationForm.indoor,
      table_count: Number(locationForm.tableCount),
      hours_text: locationForm.hoursText.trim() || "N/A",
      notes: locationForm.notes.trim() || "N/A",
      website_url: locationForm.websiteUrl.trim() || null,
      photo_path: photoPath,
    };

    const result = locationBeingEdited
      ? await supabase
          .from("table_locations")
          .update({
            ...locationValues,
            ...(!isModerator
              ? {
                  status: "pending",
                  moderated_by: null,
                  moderated_at: null,
                  last_verified_at: null,
                }
              : {}),
          })
          .eq("id", locationId)
      : await supabase.from("table_locations").insert({
          id: locationId,
          ...locationValues,
          submitted_by: userId,
          status: "pending",
        });

    const { error } = result;

    if (error) {
      console.error("Could not submit table location", error);

      if (uploadedPhotoPath && uploadedPhotoPath !== previousPhotoPath) {
        await supabase.storage
          .from(TABLE_PHOTO_BUCKET)
          .remove([uploadedPhotoPath]);
      }

      setErrorMessage(
        locationBeingEdited
          ? "Your changes could not be saved."
          : "Your table location could not be submitted."
      );
      setSaving(false);
      return;
    }

    if (previousPhotoPath && previousPhotoPath !== photoPath) {
      const { error: photoCleanupError } = await supabase.storage
        .from(TABLE_PHOTO_BUCKET)
        .remove([previousPhotoPath]);

      if (photoCleanupError) {
        console.error("Could not remove the old table photo", photoCleanupError);
      }
    }

    resetLocationEditor();
    setShowSubmissionForm(false);
    setNotice(
      locationBeingEdited
        ? isModerator
          ? "Location updated."
          : "Changes saved and sent back for review."
        : "Thanks! Your location is awaiting safety and accuracy review."
    );
    setSaving(false);
    await loadLocatorData();
  }

  async function deleteLocation(location) {
    if (!canManageLocation(location)) return;

    const confirmed = window.confirm(
      `Delete ${location.name}? This permanently removes the listing and its ratings and cannot be undone.`
    );
    if (!confirmed) return;

    setSaving(true);
    setErrorMessage("");
    setNotice("");

    const { error } = await supabase
      .from("table_locations")
      .delete()
      .eq("id", location.id);

    if (error) {
      console.error("Could not delete table location", error);
      setErrorMessage("This location could not be deleted.");
      setSaving(false);
      return;
    }

    if (location.photo_path) {
      const { error: photoError } = await supabase.storage
        .from(TABLE_PHOTO_BUCKET)
        .remove([location.photo_path]);
      if (photoError) {
        console.error("Could not clean up the deleted table photo", photoError);
      }
    }

    if (selectedLocationId === location.id) setSelectedLocationId(null);
    if (editingLocationId === location.id) closeLocationForm();
    setNotice("Location deleted.");
    setSaving(false);
    await loadLocatorData();
  }

  async function submitReview(event) {
    event.preventDefault();
    if (!selectedLocation) return;

    setSaving(true);
    setErrorMessage("");
    setNotice("");

    const { error } = await supabase.from("table_location_reviews").insert({
      location_id: selectedLocation.id,
      user_id: userId,
      rating: Number(reviewForm.rating),
      title: reviewForm.title.trim() || null,
      body: reviewForm.body.trim() || null,
      status: "pending",
    });

    if (error) {
      console.error("Could not submit table review", error);
      setErrorMessage(
        error.code === "23505"
          ? "You already submitted a rating for this location."
          : "Your rating could not be submitted."
      );
      setSaving(false);
      return;
    }

    setReviewForm({ rating: 5, title: "", body: "" });
    setNotice("Your rating is awaiting moderation before it appears publicly.");
    setSaving(false);
    await loadLocatorData();
  }

  async function submitReport(event) {
    event.preventDefault();
    if (!reportTarget) return;

    setSaving(true);
    setErrorMessage("");

    const { error } = await supabase.from("table_location_reports").insert({
      location_id: reportTarget.locationId,
      review_id: reportTarget.reviewId || null,
      reporter_id: userId,
      reason: reportForm.reason,
      details: reportForm.details.trim() || null,
      status: "open",
    });

    if (error) {
      console.error("Could not submit table report", error);
      setErrorMessage("Your report could not be submitted.");
      setSaving(false);
      return;
    }

    setReportTarget(null);
    setReportForm({ reason: "incorrect", details: "" });
    setNotice("Report received. We’ll review it as soon as possible.");
    setSaving(false);
    await loadLocatorData();
  }

  async function blockReviewer(review) {
    if (!review?.user_id || review.user_id === userId) return;

    const confirmed = window.confirm(
      "Block this reviewer? Their reviews will no longer appear for you."
    );
    if (!confirmed) return;

    const { error } = await supabase.from("table_locator_blocks").insert({
      blocker_id: userId,
      blocked_user_id: review.user_id,
    });

    if (error && error.code !== "23505") {
      console.error("Could not block reviewer", error);
      setErrorMessage("This reviewer could not be blocked.");
      return;
    }

    setBlockedUserIds((current) => [...new Set([...current, review.user_id])]);
    setNotice("Reviewer blocked.");
  }

  if (loading) {
    return <div className="locator-loading">Loading nearby tables…</div>;
  }

  const selectedRating = selectedLocation
    ? ratingsByLocation[selectedLocation.id]
    : null;
  const mapCenter = selectedLocation
    ? [selectedLocation.latitude, selectedLocation.longitude]
    : userPosition
      ? [userPosition.latitude, userPosition.longitude]
      : DEFAULT_CENTER;
  const mapZoom = selectedLocation || userPosition ? 13 : 4;
  const submissionLatitude = parseCoordinate(locationForm.latitude);
  const submissionLongitude = parseCoordinate(locationForm.longitude);
  const hasSubmissionPin =
    submissionLatitude != null && submissionLongitude != null;
  const submissionMapCenter = hasSubmissionPin
    ? [submissionLatitude, submissionLongitude]
    : userPosition
      ? [userPosition.latitude, userPosition.longitude]
      : DEFAULT_CENTER;
  const submissionMapZoom = hasSubmissionPin || userPosition ? 16 : 4;

  return (
    <section className="table-locator-page">
      <div className="locator-heading-row">
        <div>
          <p className="locator-kicker">TABLE LOCATOR</p>
          <h2>Find Tables</h2>
          <p>
            Search trusted public places to play nearby.
          </p>
        </div>

        <button
          type="button"
          className="primary-button locator-add-button"
          onClick={() => {
            if (showSubmissionForm) {
              closeLocationForm();
            } else {
              resetLocationEditor();
              setShowSubmissionForm(true);
            }
          }}
        >
          <span aria-hidden="true">{showSubmissionForm ? "×" : "+"}</span>
          {showSubmissionForm ? "Close" : "Add Table"}
        </button>
      </div>

      {errorMessage && <div className="locator-alert locator-error">{errorMessage}</div>}
      {notice && <div className="locator-alert locator-success">{notice}</div>}

      {showSubmissionForm && (
        <form
          ref={locationFormRef}
          className="locator-submission-form"
          onSubmit={submitLocation}
        >
          <div className="locator-section-heading">
            <div>
              <p className="locator-kicker">
                {editingLocation ? "EDIT LOCATION" : "NEW SUBMISSION"}
              </p>
              <h3>{editingLocation ? `Edit ${editingLocation.name}` : "Add a public table"}</h3>
            </div>
            <span>
              {editingLocation && !isModerator
                ? "Changes to published listings return to review."
                : "All listings are reviewed before publication."}
            </span>
          </div>

          <div className="locator-form-grid">
            <label>
              Venue or location name
              <input
                required
                minLength={3}
                maxLength={120}
                value={locationForm.name}
                onChange={(event) => updateLocationForm("name", event.target.value)}
                placeholder="Riverside Community Center"
              />
            </label>
            <div
              className="locator-address-field"
              onBlur={() => {
                window.setTimeout(() => setAddressSuggestions([]), 220);
              }}
            >
              <label htmlFor="locator-street-address">Street address</label>
              <input
                id="locator-street-address"
                required
                minLength={5}
                maxLength={200}
                autoComplete="street-address"
                aria-autocomplete="list"
                aria-expanded={addressSuggestions.length > 0}
                aria-controls="locator-address-suggestions"
                value={locationForm.address}
                onChange={(event) => handleStreetAddressChange(event.target.value)}
                placeholder="Start typing an address…"
              />
              {(loadingSuggestions ||
                suggestionsAttempted ||
                addressSuggestions.length > 0) && (
                <div
                  id="locator-address-suggestions"
                  className="locator-address-suggestions"
                  role="listbox"
                >
                  {loadingSuggestions ? (
                    <p>Searching Apple Maps…</p>
                  ) : addressSuggestions.length > 0 ? (
                    addressSuggestions.map((suggestion) => (
                      <button
                        key={suggestion.id}
                        type="button"
                        role="option"
                        aria-selected="false"
                        disabled={selectingSuggestion}
                        onClick={() => selectAddressSuggestion(suggestion)}
                      >
                        <strong>{suggestion.title}</strong>
                        {suggestion.subtitle && <span>{suggestion.subtitle}</span>}
                      </button>
                    ))
                  ) : (
                    <p>No address matches yet. Keep typing the street address.</p>
                  )}
                </div>
              )}
            </div>
            <label>
              City
              <input
                required
                autoComplete="address-level2"
                value={locationForm.city}
                onChange={(event) => updateLocationForm("city", event.target.value)}
              />
            </label>
            <label>
              State or region
              <input
                required
                autoComplete="address-level1"
                value={locationForm.region}
                onChange={(event) => updateLocationForm("region", event.target.value)}
              />
            </label>
            <label>
              ZIP or postal code
              <input
                required
                maxLength={20}
                autoComplete="postal-code"
                value={locationForm.postalCode}
                onChange={(event) =>
                  updateLocationForm("postalCode", event.target.value)
                }
              />
            </label>
            <label>
              Venue type
              <select
                value={locationForm.venueType}
                onChange={(event) =>
                  updateLocationForm("venueType", event.target.value)
                }
              >
                <option value="park">Park</option>
                <option value="community_center">Community center</option>
                <option value="club">Table tennis club</option>
                <option value="bar_restaurant">Bar or restaurant</option>
                <option value="school">School or campus</option>
                <option value="other">Other public venue</option>
              </select>
            </label>
            <label>
              Access
              <select
                value={locationForm.accessType}
                onChange={(event) =>
                  updateLocationForm("accessType", event.target.value)
                }
              >
                <option value="free">Free</option>
                <option value="paid">Fee required</option>
                <option value="members">Members only</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label>
              Number of tables
              <input
                required
                type="number"
                min="1"
                max="50"
                value={locationForm.tableCount}
                onChange={(event) =>
                  updateLocationForm("tableCount", event.target.value)
                }
              />
            </label>
          </div>

          <div className="locator-coordinate-box">
            <div>
              <strong>Place the table pin</strong>
              <p>
                Find the completed address with Apple Maps, tap the map, or use
                your current location while standing at the table.
              </p>
            </div>
            <div className="locator-pin-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => findAddressOnMap()}
                disabled={geocoding}
              >
                {geocoding ? "Finding address…" : "Find address on map"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => requestUserPosition({ fillSubmission: true })}
                disabled={locating}
              >
                {locating ? "Locating…" : "Use my current location"}
              </button>
            </div>
          </div>

          <div className="locator-pin-map-shell">
            <MapContainer
              center={submissionMapCenter}
              zoom={submissionMapZoom}
              scrollWheelZoom={false}
              className="locator-pin-map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapFocus center={submissionMapCenter} zoom={submissionMapZoom} />
              <MapPinSelector onSelect={setSubmissionPinAndLookup} />
              {hasSubmissionPin && (
                <Marker
                  draggable
                  position={[submissionLatitude, submissionLongitude]}
                  icon={tableMarker}
                  eventHandlers={{
                    dragend: (event) => {
                      const position = event.target.getLatLng();
                      setSubmissionPinAndLookup(position.lat, position.lng);
                    },
                  }}
                />
              )}
            </MapContainer>
            <p className={hasSubmissionPin ? "locator-pin-status-ready" : ""}>
              {reverseGeocoding
                ? "Finding the nearest street address…"
                : hasSubmissionPin
                  ? "Pin ready — tap elsewhere or drag it to adjust."
                : "No pin yet — complete the address, use your location, or tap the map."}
            </p>
          </div>

          <div className="locator-form-grid">
            <label>
              Hours or access notes (optional)
              <input
                maxLength={300}
                value={locationForm.hoursText}
                onChange={(event) =>
                  updateLocationForm("hoursText", event.target.value)
                }
                placeholder="N/A if unknown"
              />
            </label>
            <label>
              Website (optional)
              <input
                type="url"
                maxLength={500}
                value={locationForm.websiteUrl}
                onChange={(event) =>
                  updateLocationForm("websiteUrl", event.target.value)
                }
                placeholder="https://…"
              />
            </label>
          </div>

          <label className="locator-wide-field">
            Helpful details (optional)
            <textarea
              maxLength={1200}
              value={locationForm.notes}
              onChange={(event) => updateLocationForm("notes", event.target.value)}
              placeholder="N/A if unknown"
            />
          </label>

          <div className="locator-photo-picker">
            <div>
              <strong>Table photo (optional)</strong>
              <p>
                {canEditLocationPhoto
                  ? "Add a clear photo of the table or playing area. It stays private until a moderator approves the listing."
                  : "The original submitter owns this photo. It will remain unchanged."}
              </p>
            </div>
            {locationPhotoPreview && (
              <img src={locationPhotoPreview} alt="Selected table preview" />
            )}
            {canEditLocationPhoto && (
              <label className="secondary-button">
                {locationPhotoPreview ? "Choose a different photo" : "Choose photo"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleLocationPhotoChange}
                />
              </label>
            )}
            {canEditLocationPhoto && locationPhotoPreview && (
              <button
                type="button"
                className="locator-remove-photo"
                onClick={removeLocationPhoto}
              >
                Remove photo
              </button>
            )}
          </div>

          <div className="locator-check-row">
            <label>
              <input
                type="checkbox"
                checked={locationForm.indoor}
                onChange={(event) =>
                  updateLocationForm("indoor", event.target.checked)
                }
              />
              This is an indoor table
            </label>
            <label>
              <input
                required
                type="checkbox"
                checked={locationForm.publicConfirmation}
                onChange={(event) =>
                  updateLocationForm("publicConfirmation", event.target.checked)
                }
              />
              I confirm this is a publicly accessible venue—not a private home.
            </label>
          </div>

          <div className="locator-form-actions">
            <button className="primary-button" disabled={saving || geocoding}>
              {saving
                ? editingLocation
                  ? "Saving…"
                  : "Submitting…"
                : geocoding
                  ? "Finding address…"
                  : editingLocation
                    ? "Save location"
                    : "Submit for review"}
            </button>
            {editingLocation && (
              <button
                type="button"
                className="secondary-button"
                onClick={closeLocationForm}
                disabled={saving}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div className="locator-toolbar">
        <label className="locator-search">
          <span>Search locations</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, state, ZIP, venue, or address"
            enterKeyHint="search"
          />
        </label>
        <div className="locator-toolbar-actions">
          {canUseNativeAppleTableMap() && (
            <button
              type="button"
              className="primary-button locator-open-apple-map"
              onClick={openNativeAppleMap}
            >
              <span aria-hidden="true">⛶</span>
              Expand Map
            </button>
          )}
          <button
            type="button"
            className="secondary-button"
            onClick={() => requestUserPosition()}
            disabled={locating}
          >
            {locating ? "Finding you…" : "Near me"}
          </button>
        </div>
      </div>

      <div className="locator-quick-filters" role="group" aria-label="Filter tables">
        {[
          ["all", "All"],
          ["free", "Free"],
          ["indoor", "Indoor"],
          ["outdoor", "Outdoor"],
        ].map(([value, label]) => (
          <button
            type="button"
            className={quickFilter === value ? "locator-quick-filter-active" : ""}
            aria-pressed={quickFilter === value}
            key={value}
            onClick={() => setQuickFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="locator-layout">
        <div className="locator-map-panel">
          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            scrollWheelZoom
            className="locator-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapFocus center={mapCenter} zoom={mapZoom} />
            {visibleLocations.map((location) => (
              <Marker
                key={location.id}
                position={[location.latitude, location.longitude]}
                icon={tableMarker}
                eventHandlers={{
                  click: () => showWebLocationDetails(location.id),
                }}
              >
                <Popup>
                  <strong>{location.name}</strong>
                  <br />
                  {location.city}, {location.region}
                  <br />
                  <button
                    type="button"
                    className="locator-popup-details"
                    onClick={() => showWebLocationDetails(location.id)}
                  >
                    View details
                  </button>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="locator-results" aria-live="polite">
          <div className="locator-results-count">
            <strong>{visibleLocations.length}</strong>
            <span>{visibleLocations.length === 1 ? "approved table" : "approved tables"}</span>
          </div>

          {visibleLocations.length === 0 ? (
            <div className="locator-empty-state">
              <span>🏓</span>
              <h3>No approved tables found yet</h3>
              <p>Try another search or submit the first public table in this area.</p>
            </div>
          ) : (
            <div className="locator-results-list">
              {visibleLocations.map((location) => {
                const rating = ratingsByLocation[location.id];
                const isSelected = selectedLocation?.id === location.id;

                return (
                  <button
                    type="button"
                    className={`locator-result-card ${
                      isSelected ? "locator-result-card-selected" : ""
                    }`}
                    key={location.id}
                    aria-expanded={isSelected}
                    onClick={() =>
                      showWebLocationDetails(location.id, { toggle: true })
                    }
                  >
                    <div className="locator-result-card-topline">
                      <strong>{location.name}</strong>
                      {location.distance != null && (
                        <span>{location.distance.toFixed(1)} mi</span>
                      )}
                    </div>
                    <p>{location.city}, {location.region}</p>
                    <div className="locator-card-meta">
                      <span>{location.indoor ? "Indoor" : "Outdoor"}</span>
                      <span>{formatAccessType(location.access_type)}</span>
                      <span>
                        {rating ? `${(rating.total / rating.count).toFixed(1)} ★` : "New"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!selectedLocation && visibleLocations.length > 0 && (
        <div className="locator-selection-prompt">
          <span>Location details</span>
          <strong>Tap a table card or map pin to expand</strong>
        </div>
      )}

      {selectedLocation && (
        <article className="locator-detail-card">
          <div className="locator-detail-heading">
            <div>
              <p className="locator-kicker">SELECTED LOCATION</p>
              <h3>{selectedLocation.name}</h3>
              <p>
                {selectedLocation.address}, {selectedLocation.city},{" "}
                {selectedLocation.region} {selectedLocation.postal_code || ""}
              </p>
            </div>
            <div className="locator-detail-heading-actions">
              <a
                className="primary-button locator-directions-link"
                href={`https://maps.apple.com/?daddr=${selectedLocation.latitude},${selectedLocation.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                Get directions
              </a>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setSelectedLocationId(null)}
              >
                Close details
              </button>
            </div>
          </div>

          {selectedLocation.photo_path &&
            photoUrlsByPath[selectedLocation.photo_path] && (
              <img
                className="locator-detail-photo"
                src={photoUrlsByPath[selectedLocation.photo_path]}
                alt={`Table at ${selectedLocation.name}`}
              />
            )}

          <div className="locator-detail-tags">
            <span>{formatVenueType(selectedLocation.venue_type)}</span>
            <span>{formatAccessType(selectedLocation.access_type)}</span>
            <span>{selectedLocation.indoor ? "Indoor" : "Outdoor"}</span>
            <span>
              {selectedLocation.table_count} {selectedLocation.table_count === 1 ? "table" : "tables"}
            </span>
          </div>

          <div className="locator-detail-grid">
            <div>
              <span>Community rating</span>
              <strong>
                {selectedRating
                  ? `${(selectedRating.total / selectedRating.count).toFixed(1)} / 5`
                  : "Not rated yet"}
              </strong>
            </div>
            <div>
              <span>Last verified</span>
              <strong>
                {selectedLocation.last_verified_at
                  ? new Date(selectedLocation.last_verified_at).toLocaleDateString()
                  : "Awaiting verification"}
              </strong>
            </div>
            <div>
              <span>Hours</span>
              <strong>{selectedLocation.hours_text || "N/A"}</strong>
            </div>
          </div>

          <p className="locator-notes">{selectedLocation.notes || "N/A"}</p>

          <div className="locator-detail-actions">
            {selectedLocation.website_url ? (
              <a href={selectedLocation.website_url} target="_blank" rel="noreferrer">
                Venue website
              </a>
            ) : (
              <span className="locator-na">Website: N/A</span>
            )}
            <button
              type="button"
              className="locator-text-button locator-report-button"
              onClick={() =>
                setReportTarget({ locationId: selectedLocation.id, reviewId: null })
              }
            >
              Report a problem
            </button>
            {canManageLocation(selectedLocation) && (
              <>
                <button
                  type="button"
                  className="locator-text-button locator-edit-button"
                  onClick={() => startEditingLocation(selectedLocation)}
                  disabled={saving}
                >
                  Edit location
                </button>
                <button
                  type="button"
                  className="locator-text-button locator-delete-button"
                  onClick={() => deleteLocation(selectedLocation)}
                  disabled={saving}
                >
                  Delete location
                </button>
              </>
            )}
          </div>

          <div className="locator-review-grid">
            <form className="locator-review-form" onSubmit={submitReview}>
              <h4>Rate this table</h4>
              <label>
                Rating
                <select
                  value={reviewForm.rating}
                  onChange={(event) =>
                    setReviewForm((current) => ({
                      ...current,
                      rating: Number(event.target.value),
                    }))
                  }
                >
                  <option value="5">5 — Excellent</option>
                  <option value="4">4 — Good</option>
                  <option value="3">3 — Fair</option>
                  <option value="2">2 — Poor</option>
                  <option value="1">1 — Very poor</option>
                </select>
              </label>
              <label>
                Short title (optional)
                <input
                  maxLength={100}
                  value={reviewForm.title}
                  onChange={(event) =>
                    setReviewForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Helpful details (optional)
                <textarea
                  maxLength={1000}
                  value={reviewForm.body}
                  onChange={(event) =>
                    setReviewForm((current) => ({
                      ...current,
                      body: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="secondary-button" disabled={saving}>
                Submit rating
              </button>
              <small>Ratings are moderated before appearing publicly.</small>
            </form>

            <div className="locator-community-reviews">
              <h4>Community notes</h4>
              {selectedReviews.length === 0 ? (
                <p>No approved reviews yet.</p>
              ) : (
                selectedReviews.map((review) => (
                  <div className="locator-review" key={review.id}>
                    <div>
                      <strong>{review.rating} ★</strong>
                      <span>{new Date(review.created_at).toLocaleDateString()}</span>
                    </div>
                    {review.title && <h5>{review.title}</h5>}
                    {review.body && <p>{review.body}</p>}
                    {review.user_id !== userId && (
                      <div className="locator-review-actions">
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              locationId: selectedLocation.id,
                              reviewId: review.id,
                            })
                          }
                        >
                          Report
                        </button>
                        <button type="button" onClick={() => blockReviewer(review)}>
                          Block reviewer
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </article>
      )}

      {photoSuggestionTarget && (
        <form
          className="locator-report-form locator-photo-suggestion-form"
          onSubmit={submitPhotoSuggestion}
        >
          <div>
            <h3>Add a photo for {photoSuggestionTarget.name}</h3>
            <p>
              Your photo stays private until a moderator confirms it belongs to
              this public table.
            </p>
          </div>
          <div className="locator-photo-picker">
            <div>
              <strong>Clear table or playing-area photo</strong>
              <p>JPEG, PNG, or WebP. Maximum size 5 MB.</p>
            </div>
            {photoSuggestionPreview && (
              <img src={photoSuggestionPreview} alt="Suggested table preview" />
            )}
            <label className="secondary-button">
              {photoSuggestionPreview ? "Choose a different photo" : "Choose photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoSuggestionChange}
              />
            </label>
          </div>
          <div className="locator-form-actions">
            <button
              className="primary-button"
              disabled={saving || !photoSuggestionFile}
            >
              {saving ? "Sending…" : "Send for approval"}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={closePhotoSuggestion}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {reportTarget && (
        <form className="locator-report-form" onSubmit={submitReport}>
          <div>
            <h3>Report a safety or accuracy issue</h3>
            <p>Reports go directly to the moderation queue.</p>
          </div>
          <label>
            Reason
            <select
              value={reportForm.reason}
              onChange={(event) =>
                setReportForm((current) => ({
                  ...current,
                  reason: event.target.value,
                }))
              }
            >
              <option value="incorrect">Incorrect information</option>
              <option value="closed">Location is closed</option>
              <option value="private_property">Private property</option>
              <option value="unsafe">Safety concern</option>
              <option value="abusive">Abusive content</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label>
            Details
            <textarea
              maxLength={1000}
              value={reportForm.details}
              onChange={(event) =>
                setReportForm((current) => ({
                  ...current,
                  details: event.target.value,
                }))
              }
              placeholder="Tell us what needs attention."
            />
          </label>
          <div className="locator-form-actions">
            <button className="primary-button" disabled={saving}>Submit report</button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setReportTarget(null)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {myPendingLocations.length > 0 && !isModerator && (
        <section className="locator-pending-panel">
          <p className="locator-kicker">YOUR SUBMISSIONS</p>
          <h3>Awaiting review</h3>
          {myPendingLocations.map((location) => (
            <div key={location.id} className="locator-moderation-row">
              {location.photo_path && photoUrlsByPath[location.photo_path] && (
                <img
                  className="locator-moderation-photo"
                  src={photoUrlsByPath[location.photo_path]}
                  alt="Submitted table"
                />
              )}
              <div className="locator-moderation-copy">
                <strong>{location.name}</strong>
                <span>{location.city}, {location.region}</span>
              </div>
              <div className="locator-pending-actions">
                <span className="locator-pending-badge">Pending</span>
                <button
                  type="button"
                  className="locator-text-button locator-edit-button"
                  onClick={() => startEditingLocation(location)}
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="locator-text-button locator-delete-button"
                  onClick={() => deleteLocation(location)}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

    </section>
  );
}

export default TableLocator;
