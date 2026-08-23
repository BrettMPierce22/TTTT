import { useCallback, useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./TableLocator.css";
import { supabase } from "../../lib/supabaseClient";

const DEFAULT_CENTER = [39.8283, -98.5795];

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

  useEffect(() => {
    map.flyTo(center, zoom, { duration: 0.65 });
  }, [center, map, zoom]);

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

function TableLocator({ userId }) {
  const [locations, setLocations] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [reports, setReports] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [userPosition, setUserPosition] = useState(null);
  const [locating, setLocating] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
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

  const loadLocatorData = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setErrorMessage("");

    const [moderatorResult, locationResult, reviewResult, reportResult, blockResult] =
      await Promise.all([
        supabase
          .from("table_locator_moderators")
          .select("user_id")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("table_locations")
          .select(
            "id,name,address,city,region,postal_code,latitude,longitude,venue_type,access_type,indoor,table_count,hours_text,notes,website_url,submitted_by,status,last_verified_at,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("table_location_reviews")
          .select(
            "id,location_id,user_id,rating,title,body,status,created_at"
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("table_location_reports")
          .select(
            "id,location_id,review_id,reporter_id,reason,details,status,created_at"
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
      reportResult.error ||
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
    setIsModerator(Boolean(moderatorResult.data));
    setLocations(nextLocations);
    setReviews(reviewResult.data || []);
    setReports(reportResult.data || []);
    setBlockedUserIds(
      (blockResult.data || []).map((item) => item.blocked_user_id)
    );

    setSelectedLocationId((current) => {
      if (current && nextLocations.some((location) => location.id === current)) {
        return current;
      }

      return (
        nextLocations.find((location) => location.status === "approved")?.id ||
        null
      );
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
        if (!normalizedQuery) return true;

        return [
          location.name,
          location.address,
          location.city,
          location.region,
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
  }, [approvedLocations, query, userPosition]);

  const selectedLocation = useMemo(
    () =>
      approvedLocations.find(
        (location) => location.id === selectedLocationId
      ) || visibleLocations[0] || null,
    [approvedLocations, selectedLocationId, visibleLocations]
  );

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

  const pendingLocations = useMemo(
    () => locations.filter((location) => location.status === "pending"),
    [locations]
  );

  const pendingReviews = useMemo(
    () => reviews.filter((review) => review.status === "pending"),
    [reviews]
  );

  const openReports = useMemo(
    () => reports.filter((report) => report.status === "open"),
    [reports]
  );

  function updateLocationForm(field, value) {
    setLocationForm((current) => ({ ...current, [field]: value }));
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
          setLocationForm((current) => ({
            ...current,
            latitude: nextPosition.latitude.toFixed(6),
            longitude: nextPosition.longitude.toFixed(6),
          }));
        }
        setLocating(false);
      },
      () => {
        setErrorMessage(
          "We could not access your location. You can search by city or enter the table coordinates manually."
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

    const latitude = Number(locationForm.latitude);
    const longitude = Number(locationForm.longitude);

    if (!locationForm.publicConfirmation) {
      setErrorMessage(
        "Confirm that this is a publicly accessible venue and not a private residence."
      );
      return;
    }

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setErrorMessage(
        "Add valid coordinates or use your current location while standing near the table."
      );
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("table_locations").insert({
      name: locationForm.name.trim(),
      address: locationForm.address.trim(),
      city: locationForm.city.trim(),
      region: locationForm.region.trim(),
      postal_code: locationForm.postalCode.trim() || null,
      latitude,
      longitude,
      venue_type: locationForm.venueType,
      access_type: locationForm.accessType,
      indoor: locationForm.indoor,
      table_count: Number(locationForm.tableCount),
      hours_text: locationForm.hoursText.trim() || null,
      notes: locationForm.notes.trim() || null,
      website_url: locationForm.websiteUrl.trim() || null,
      submitted_by: userId,
      status: "pending",
    });

    if (error) {
      console.error("Could not submit table location", error);
      setErrorMessage("Your table location could not be submitted.");
      setSaving(false);
      return;
    }

    setLocationForm(EMPTY_LOCATION_FORM);
    setShowSubmissionForm(false);
    setNotice("Thanks! Your location is awaiting safety and accuracy review.");
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

  async function moderateLocation(locationId, status) {
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("table_locations")
      .update({
        status,
        moderated_by: userId,
        moderated_at: now,
        last_verified_at: status === "approved" ? now : null,
      })
      .eq("id", locationId);

    if (error) {
      console.error("Could not moderate location", error);
      setErrorMessage("The location moderation update failed.");
    } else {
      setNotice(`Location ${status}.`);
      await loadLocatorData();
    }
    setSaving(false);
  }

  async function moderateReview(reviewId, status) {
    setSaving(true);
    const { error } = await supabase
      .from("table_location_reviews")
      .update({
        status,
        moderated_by: userId,
        moderated_at: new Date().toISOString(),
      })
      .eq("id", reviewId);

    if (error) {
      console.error("Could not moderate review", error);
      setErrorMessage("The review moderation update failed.");
    } else {
      setNotice(`Review ${status}.`);
      await loadLocatorData();
    }
    setSaving(false);
  }

  async function resolveReport(reportId) {
    setSaving(true);
    const { error } = await supabase
      .from("table_location_reports")
      .update({
        status: "resolved",
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    if (error) {
      console.error("Could not resolve report", error);
      setErrorMessage("The report could not be resolved.");
    } else {
      setNotice("Report resolved.");
      await loadLocatorData();
    }
    setSaving(false);
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

  return (
    <section className="table-locator-page">
      <div className="locator-heading-row">
        <div>
          <p className="locator-kicker">COMMUNITY TABLE MAP</p>
          <h2>Find a Place to Play</h2>
          <p>
            Discover moderated public tables, check access details, and help the
            community keep listings accurate.
          </p>
        </div>

        <button
          type="button"
          className="primary-button locator-add-button"
          onClick={() => setShowSubmissionForm((current) => !current)}
        >
          {showSubmissionForm ? "Close form" : "+ Add a table"}
        </button>
      </div>

      {errorMessage && <div className="locator-alert locator-error">{errorMessage}</div>}
      {notice && <div className="locator-alert locator-success">{notice}</div>}

      {showSubmissionForm && (
        <form className="locator-submission-form" onSubmit={submitLocation}>
          <div className="locator-section-heading">
            <div>
              <p className="locator-kicker">NEW SUBMISSION</p>
              <h3>Add a public table</h3>
            </div>
            <span>All listings are reviewed before publication.</span>
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
            <label>
              Street address
              <input
                required
                minLength={5}
                maxLength={200}
                value={locationForm.address}
                onChange={(event) => updateLocationForm("address", event.target.value)}
                placeholder="123 Main Street"
              />
            </label>
            <label>
              City
              <input
                required
                value={locationForm.city}
                onChange={(event) => updateLocationForm("city", event.target.value)}
              />
            </label>
            <label>
              State or region
              <input
                required
                value={locationForm.region}
                onChange={(event) => updateLocationForm("region", event.target.value)}
              />
            </label>
            <label>
              ZIP or postal code
              <input
                maxLength={20}
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
              <strong>Pin the table accurately</strong>
              <p>
                If you are at the venue, use your current location. Your device
                position is not stored separately.
              </p>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => requestUserPosition({ fillSubmission: true })}
              disabled={locating}
            >
              {locating ? "Locating…" : "Use my current location"}
            </button>
          </div>

          <div className="locator-form-grid locator-coordinate-fields">
            <label>
              Latitude
              <input
                required
                inputMode="decimal"
                value={locationForm.latitude}
                onChange={(event) =>
                  updateLocationForm("latitude", event.target.value)
                }
                placeholder="38.9072"
              />
            </label>
            <label>
              Longitude
              <input
                required
                inputMode="decimal"
                value={locationForm.longitude}
                onChange={(event) =>
                  updateLocationForm("longitude", event.target.value)
                }
                placeholder="-77.0369"
              />
            </label>
          </div>

          <div className="locator-form-grid">
            <label>
              Hours or access notes
              <input
                maxLength={300}
                value={locationForm.hoursText}
                onChange={(event) =>
                  updateLocationForm("hoursText", event.target.value)
                }
                placeholder="Daily, 8 AM–9 PM"
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
            Helpful details
            <textarea
              maxLength={1200}
              value={locationForm.notes}
              onChange={(event) => updateLocationForm("notes", event.target.value)}
              placeholder="Bring paddles, check in at the front desk, outdoor lighting, etc."
            />
          </label>

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

          <button className="primary-button" disabled={saving}>
            {saving ? "Submitting…" : "Submit for review"}
          </button>
        </form>
      )}

      <div className="locator-toolbar">
        <label className="locator-search">
          <span>Search locations</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, venue, or address"
          />
        </label>
        <button
          type="button"
          className="secondary-button"
          onClick={() => requestUserPosition()}
          disabled={locating}
        >
          {locating ? "Finding you…" : "Near me"}
        </button>
      </div>

      <div className="locator-layout">
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
            visibleLocations.map((location) => {
              const rating = ratingsByLocation[location.id];
              const isSelected = selectedLocation?.id === location.id;

              return (
                <button
                  type="button"
                  className={`locator-result-card ${
                    isSelected ? "locator-result-card-selected" : ""
                  }`}
                  key={location.id}
                  onClick={() => setSelectedLocationId(location.id)}
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
            })
          )}
        </div>

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
                  click: () => setSelectedLocationId(location.id),
                }}
              >
                <Popup>
                  <strong>{location.name}</strong>
                  <br />
                  {location.city}, {location.region}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

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
            <a
              className="primary-button locator-directions-link"
              href={`https://maps.apple.com/?daddr=${selectedLocation.latitude},${selectedLocation.longitude}`}
              target="_blank"
              rel="noreferrer"
            >
              Get directions
            </a>
          </div>

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
              <strong>{selectedLocation.hours_text || "Check with venue"}</strong>
            </div>
          </div>

          {selectedLocation.notes && <p className="locator-notes">{selectedLocation.notes}</p>}

          <div className="locator-detail-actions">
            {selectedLocation.website_url && (
              <a href={selectedLocation.website_url} target="_blank" rel="noreferrer">
                Venue website
              </a>
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
              <div>
                <strong>{location.name}</strong>
                <span>{location.city}, {location.region}</span>
              </div>
              <span className="locator-pending-badge">Pending</span>
            </div>
          ))}
        </section>
      )}

      {isModerator && (
        <section className="locator-moderation-panel">
          <div className="locator-section-heading">
            <div>
              <p className="locator-kicker">SAFETY TOOLS</p>
              <h3>Moderation queue</h3>
            </div>
            <span>
              {pendingLocations.length + pendingReviews.length + openReports.length} open items
            </span>
          </div>

          <h4>Pending locations</h4>
          {pendingLocations.length === 0 ? (
            <p>Nothing waiting.</p>
          ) : (
            pendingLocations.map((location) => (
              <div className="locator-moderation-row" key={location.id}>
                <div>
                  <strong>{location.name}</strong>
                  <span>{location.address}, {location.city}, {location.region}</span>
                </div>
                <div>
                  <button
                    type="button"
                    className="locator-approve-button"
                    onClick={() => moderateLocation(location.id, "approved")}
                    disabled={saving}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="locator-reject-button"
                    onClick={() => moderateLocation(location.id, "rejected")}
                    disabled={saving}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}

          <h4>Pending ratings</h4>
          {pendingReviews.length === 0 ? (
            <p>Nothing waiting.</p>
          ) : (
            pendingReviews.map((review) => (
              <div className="locator-moderation-row" key={review.id}>
                <div>
                  <strong>{review.rating} ★ {review.title || "Untitled rating"}</strong>
                  <span>{review.body || "No written review"}</span>
                </div>
                <div>
                  <button
                    type="button"
                    className="locator-approve-button"
                    onClick={() => moderateReview(review.id, "approved")}
                    disabled={saving}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="locator-reject-button"
                    onClick={() => moderateReview(review.id, "rejected")}
                    disabled={saving}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}

          <h4>Open reports</h4>
          {openReports.length === 0 ? (
            <p>Nothing waiting.</p>
          ) : (
            openReports.map((report) => (
              <div className="locator-moderation-row" key={report.id}>
                <div>
                  <strong>{report.reason.replaceAll("_", " ")}</strong>
                  <span>{report.details || "No additional details"}</span>
                </div>
                <button
                  type="button"
                  className="locator-approve-button"
                  onClick={() => resolveReport(report.id)}
                  disabled={saving}
                >
                  Resolve
                </button>
              </div>
            ))
          )}
        </section>
      )}
    </section>
  );
}

export default TableLocator;
