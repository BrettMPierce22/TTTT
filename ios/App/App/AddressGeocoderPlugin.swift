import Capacitor
import CoreLocation
import MapKit

@objc(AddressGeocoderPlugin)
public class AddressGeocoderPlugin: CAPPlugin, CAPBridgedPlugin, MKLocalSearchCompleterDelegate {
    public let identifier = "AddressGeocoderPlugin"
    public let jsName = "AddressGeocoder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "geocode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suggest", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resolveSuggestion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reverseGeocode", returnType: CAPPluginReturnPromise)
    ]

    private let geocoder = CLGeocoder()
    private var searchCompleter: MKLocalSearchCompleter?
    private var suggestionSearch: MKLocalSearch?
    private var suggestionCall: CAPPluginCall?
    private var suggestionQuery = ""
    private var suggestionToken: UUID?
    private var completionsByID: [String: MKLocalSearchCompletion] = [:]
    private var mapItemsByID: [String: MKMapItem] = [:]
    private var resolutionSearch: MKLocalSearch?

    private func addressPayload(
        placemark: CLPlacemark,
        coordinate: CLLocationCoordinate2D
    ) -> [String: Any] {
        let street = [placemark.subThoroughfare, placemark.thoroughfare]
            .compactMap { $0 }
            .joined(separator: " ")

        return [
            "latitude": coordinate.latitude,
            "longitude": coordinate.longitude,
            "street": street,
            "city": placemark.locality ?? placemark.subAdministrativeArea ?? "",
            "region": placemark.administrativeArea ?? "",
            "postalCode": placemark.postalCode ?? "",
            "country": placemark.country ?? ""
        ]
    }

    @objc func geocode(_ call: CAPPluginCall) {
        guard let rawAddress = call.getString("address") else {
            call.reject("Enter a complete address.")
            return
        }

        let address = rawAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !address.isEmpty else {
            call.reject("Enter a complete address.")
            return
        }

        if geocoder.isGeocoding {
            geocoder.cancelGeocode()
        }

        geocoder.geocodeAddressString(address) { placemarks, error in
            DispatchQueue.main.async {
                guard error == nil,
                      let placemark = placemarks?.first,
                      let coordinate = placemark.location?.coordinate else {
                    call.reject("Apple Maps could not find that address. Check it or place the pin manually.")
                    return
                }

                call.resolve(self.addressPayload(placemark: placemark, coordinate: coordinate))
            }
        }
    }

    @objc func suggest(_ call: CAPPluginCall) {
        let query = call.getString("query", "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard query.count >= 3 else {
            call.resolve(["suggestions": []])
            return
        }

        DispatchQueue.main.async {
            self.suggestionSearch?.cancel()
            self.searchCompleter?.delegate = nil
            self.suggestionCall?.resolve(["suggestions": []])
            self.completionsByID.removeAll()
            self.mapItemsByID.removeAll()

            let token = UUID()
            let completer = MKLocalSearchCompleter()
            completer.resultTypes = .address
            completer.delegate = self

            self.suggestionCall = call
            self.suggestionQuery = query
            self.suggestionToken = token
            self.searchCompleter = completer
            completer.queryFragment = query

            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                guard self.suggestionToken == token,
                      self.suggestionCall != nil else { return }

                self.runSuggestionFallback(query: query, token: token)
            }
        }
    }

    public func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        guard completer === searchCompleter else { return }

        let suggestions: [[String: String]] = completer.results
            .prefix(6)
            .enumerated()
            .map { index, completion in
                let id = String(index)
                completionsByID[id] = completion
                return [
                    "id": id,
                    "title": completion.title,
                    "subtitle": completion.subtitle
                ]
            }

        if suggestions.isEmpty, let token = suggestionToken {
            runSuggestionFallback(query: suggestionQuery, token: token)
        } else {
            finishSuggestions(suggestions)
        }
    }

    public func completer(
        _ completer: MKLocalSearchCompleter,
        didFailWithError error: Error
    ) {
        guard completer === searchCompleter,
              let token = suggestionToken else { return }

        runSuggestionFallback(query: suggestionQuery, token: token)
    }

    private func runSuggestionFallback(query: String, token: UUID) {
        guard suggestionToken == token else { return }

        searchCompleter?.delegate = nil
        searchCompleter = nil

        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        request.resultTypes = .address
        let search = MKLocalSearch(request: request)
        suggestionSearch?.cancel()
        suggestionSearch = search

        search.start { response, _ in
            DispatchQueue.main.async {
                guard self.suggestionToken == token,
                      self.suggestionSearch === search else { return }

                self.suggestionSearch = nil
                let suggestions: [[String: String]] = (response?.mapItems ?? [])
                    .prefix(6)
                    .enumerated()
                    .map { index, mapItem in
                        let id = String(index)
                        self.mapItemsByID[id] = mapItem
                        let placemark = mapItem.placemark
                        let street = [placemark.subThoroughfare, placemark.thoroughfare]
                            .compactMap { $0 }
                            .joined(separator: " ")
                        let subtitle = [
                            placemark.locality,
                            placemark.administrativeArea,
                            placemark.postalCode
                        ]
                            .compactMap { $0 }
                            .joined(separator: ", ")

                        return [
                            "id": id,
                            "title": street.isEmpty ? (mapItem.name ?? "Address") : street,
                            "subtitle": subtitle
                        ]
                    }

                self.finishSuggestions(suggestions)
            }
        }
    }

    private func finishSuggestions(_ suggestions: [[String: String]]) {
        let call = suggestionCall
        suggestionCall = nil
        suggestionToken = nil
        suggestionQuery = ""
        searchCompleter?.delegate = nil
        searchCompleter = nil
        suggestionSearch = nil
        call?.resolve(["suggestions": suggestions])
    }

    @objc func resolveSuggestion(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Choose an address suggestion first.")
            return
        }

        if let mapItem = mapItemsByID[id] {
            let placemark = mapItem.placemark
            call.resolve(
                addressPayload(
                    placemark: placemark,
                    coordinate: placemark.coordinate
                )
            )
            return
        }

        guard let completion = completionsByID[id] else {
            call.reject("That address suggestion expired. Search again.")
            return
        }

        resolutionSearch?.cancel()
        let request = MKLocalSearch.Request(completion: completion)
        request.resultTypes = .address
        let search = MKLocalSearch(request: request)
        resolutionSearch = search

        search.start { response, error in
            DispatchQueue.main.async {
                guard self.resolutionSearch === search else { return }
                self.resolutionSearch = nil

                guard error == nil,
                      let placemark = response?.mapItems.first?.placemark else {
                    call.reject("Apple Maps could not open that address suggestion.")
                    return
                }

                call.resolve(
                    self.addressPayload(
                        placemark: placemark,
                        coordinate: placemark.coordinate
                    )
                )
            }
        }
    }

    @objc func reverseGeocode(_ call: CAPPluginCall) {
        guard let latitude = call.getDouble("latitude"),
              let longitude = call.getDouble("longitude"),
              (-90...90).contains(latitude),
              (-180...180).contains(longitude) else {
            call.reject("The selected map coordinate is invalid.")
            return
        }

        if geocoder.isGeocoding {
            geocoder.cancelGeocode()
        }

        let location = CLLocation(latitude: latitude, longitude: longitude)
        geocoder.reverseGeocodeLocation(location) { placemarks, error in
            DispatchQueue.main.async {
                guard error == nil,
                      let placemark = placemarks?.first else {
                    call.reject("Apple Maps could not find an address for that pin.")
                    return
                }

                call.resolve(
                    self.addressPayload(
                        placemark: placemark,
                        coordinate: location.coordinate
                    )
                )
            }
        }
    }
}
