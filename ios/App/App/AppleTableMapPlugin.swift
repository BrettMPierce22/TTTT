import Capacitor
import CoreLocation
import MapKit
import UIKit

private struct AppleTableLocation {
    let id: String
    let name: String
    let address: String
    let city: String
    let region: String
    let postalCode: String
    let latitude: Double
    let longitude: Double
    let venueType: String
    let accessType: String
    let indoor: Bool
    let tableCount: Int
    let rating: Double?
    let hoursText: String
    let notes: String
    let websiteURL: String
    let lastVerifiedAt: String
    let sourceName: String
    let sourceURL: String

    init?(object: JSObject) {
        func string(_ key: String) -> String {
            object[key] as? String ?? ""
        }

        func number(_ key: String) -> Double? {
            if let value = object[key] as? Double { return value }
            if let value = object[key] as? NSNumber { return value.doubleValue }
            if let value = object[key] as? String { return Double(value) }
            return nil
        }

        guard let latitude = number("latitude"),
              let longitude = number("longitude"),
              (-90...90).contains(latitude),
              (-180...180).contains(longitude),
              !string("id").isEmpty else {
            return nil
        }

        id = string("id")
        name = string("name").isEmpty ? "Public table" : string("name")
        address = string("address")
        city = string("city")
        region = string("region")
        postalCode = string("postalCode")
        self.latitude = latitude
        self.longitude = longitude
        venueType = string("venueType")
        accessType = string("accessType")
        indoor = object["indoor"] as? Bool ?? false
        tableCount = (object["tableCount"] as? NSNumber)?.intValue ?? 1
        rating = number("rating")
        hoursText = string("hoursText")
        notes = string("notes")
        websiteURL = string("websiteUrl")
        lastVerifiedAt = string("lastVerifiedAt")
        sourceName = string("sourceName")
        sourceURL = string("sourceUrl")
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var locality: String {
        [city, region].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var fullAddress: String {
        let regionAndPostal = [region, postalCode].filter { !$0.isEmpty }.joined(separator: " ")
        return [address, city, regionAndPostal].filter { !$0.isEmpty }.joined(separator: ", ")
    }

    var venueLabel: String {
        switch venueType {
        case "park": return "Park"
        case "community_center": return "Community center"
        case "club": return "Table tennis club"
        case "bar_restaurant": return "Bar or restaurant"
        case "school": return "School or campus"
        default: return "Public venue"
        }
    }

    var accessLabel: String {
        switch accessType {
        case "free": return "Free"
        case "paid": return "Fee required"
        case "members": return "Members only"
        default: return "Access unknown"
        }
    }
}

private final class AppleTableDetailsViewController: UIViewController {
    private let location: AppleTableLocation

    init(location: AppleTableLocation) {
        self.location = location
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Table Details"
        view.backgroundColor = .systemGroupedBackground

        navigationItem.rightBarButtonItem = UIBarButtonItem(
            title: "Directions",
            style: .done,
            target: self,
            action: #selector(openDirections)
        )

        let scrollView = UIScrollView()
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = true
        view.addSubview(scrollView)

        let contentStack = UIStackView()
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        contentStack.axis = .vertical
        contentStack.spacing = 16
        scrollView.addSubview(contentStack)

        let titleLabel = UILabel()
        titleLabel.font = .preferredFont(forTextStyle: .title2)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.numberOfLines = 0
        titleLabel.text = location.name

        let addressLabel = UILabel()
        addressLabel.font = .preferredFont(forTextStyle: .subheadline)
        addressLabel.adjustsFontForContentSizeCategory = true
        addressLabel.textColor = .secondaryLabel
        addressLabel.numberOfLines = 0
        addressLabel.text = display(location.fullAddress)

        let heroStack = UIStackView(arrangedSubviews: [titleLabel, addressLabel])
        heroStack.axis = .vertical
        heroStack.spacing = 6
        contentStack.addArrangedSubview(makeGlassCard(content: heroStack, padding: 18))

        contentStack.addArrangedSubview(makeSection(
            title: "TABLE INFORMATION",
            rows: [
                ("Venue", location.venueLabel),
                ("Access", location.accessLabel),
                ("Setting", location.indoor ? "Indoor" : "Outdoor"),
                ("Tables", String(location.tableCount)),
                ("Community rating", location.rating.map { String(format: "%.1f / 5", $0) } ?? "Not rated yet"),
            ]
        ))

        contentStack.addArrangedSubview(makeSection(
            title: "ADDITIONAL DETAILS",
            rows: [
                ("Hours", display(location.hoursText)),
                ("Last verified", formattedVerificationDate()),
                ("Website", display(location.websiteURL)),
                ("Notes", display(location.notes)),
            ]
        ))

        if location.sourceName == "openstreetmap" {
            let sourceButton = UIButton(type: .system)
            var configuration = UIButton.Configuration.plain()
            configuration.title = "View source on OpenStreetMap"
            configuration.image = UIImage(systemName: "arrow.up.right.square")
            configuration.imagePadding = 7
            sourceButton.configuration = configuration
            sourceButton.contentHorizontalAlignment = .leading
            sourceButton.addTarget(self, action: #selector(openSource), for: .touchUpInside)
            sourceButton.isEnabled = !location.sourceURL.isEmpty
            contentStack.addArrangedSubview(makeGlassCard(content: sourceButton, padding: 10))
        }

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: view.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            contentStack.topAnchor.constraint(equalTo: scrollView.contentLayoutGuide.topAnchor, constant: 18),
            contentStack.leadingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.leadingAnchor, constant: 16),
            contentStack.trailingAnchor.constraint(equalTo: scrollView.frameLayoutGuide.trailingAnchor, constant: -16),
            contentStack.bottomAnchor.constraint(equalTo: scrollView.contentLayoutGuide.bottomAnchor, constant: -28),
        ])
    }

    private func display(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "N/A" : trimmed
    }

    private func formattedVerificationDate() -> String {
        guard !location.lastVerifiedAt.isEmpty,
              let date = ISO8601DateFormatter().date(from: location.lastVerifiedAt) else {
            return "N/A"
        }

        return date.formatted(date: .abbreviated, time: .omitted)
    }

    private func makeGlassCard(content: UIView, padding: CGFloat) -> UIView {
        let effectView: UIVisualEffectView
        if #available(iOS 26.0, *) {
            let effect = UIGlassEffect(style: .regular)
            effect.tintColor = UIColor.systemBackground.withAlphaComponent(0.08)
            effectView = UIVisualEffectView(effect: effect)
        } else {
            effectView = UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
        }

        effectView.layer.cornerRadius = 22
        effectView.clipsToBounds = true
        content.translatesAutoresizingMaskIntoConstraints = false
        effectView.contentView.addSubview(content)

        NSLayoutConstraint.activate([
            content.topAnchor.constraint(equalTo: effectView.contentView.topAnchor, constant: padding),
            content.leadingAnchor.constraint(equalTo: effectView.contentView.leadingAnchor, constant: padding),
            content.trailingAnchor.constraint(equalTo: effectView.contentView.trailingAnchor, constant: -padding),
            content.bottomAnchor.constraint(equalTo: effectView.contentView.bottomAnchor, constant: -padding),
        ])
        return effectView
    }

    private func makeSection(title: String, rows: [(String, String)]) -> UIView {
        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 0

        let titleLabel = UILabel()
        titleLabel.font = .preferredFont(forTextStyle: .caption1)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textColor = .secondaryLabel
        titleLabel.text = title
        stack.addArrangedSubview(titleLabel)
        stack.setCustomSpacing(10, after: titleLabel)

        for (index, row) in rows.enumerated() {
            if index > 0 {
                let divider = UIView()
                divider.backgroundColor = .separator
                divider.translatesAutoresizingMaskIntoConstraints = false
                divider.heightAnchor.constraint(equalToConstant: 0.5).isActive = true
                stack.addArrangedSubview(divider)
            }

            let label = UILabel()
            label.font = .preferredFont(forTextStyle: .subheadline)
            label.adjustsFontForContentSizeCategory = true
            label.textColor = .secondaryLabel
            label.text = row.0
            label.setContentHuggingPriority(.required, for: .horizontal)

            let value = UILabel()
            value.font = .preferredFont(forTextStyle: .body)
            value.adjustsFontForContentSizeCategory = true
            value.textAlignment = .right
            value.numberOfLines = 0
            value.text = row.1
            value.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

            let rowStack = UIStackView(arrangedSubviews: [label, value])
            rowStack.axis = .horizontal
            rowStack.alignment = .firstBaseline
            rowStack.spacing = 12
            rowStack.isLayoutMarginsRelativeArrangement = true
            rowStack.layoutMargins = UIEdgeInsets(top: 11, left: 0, bottom: 11, right: 0)
            stack.addArrangedSubview(rowStack)
        }

        return makeGlassCard(content: stack, padding: 16)
    }

    @objc private func openDirections() {
        let placemark = MKPlacemark(coordinate: location.coordinate)
        let item = MKMapItem(placemark: placemark)
        item.name = location.name
        item.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving,
        ])
    }

    @objc private func openSource() {
        guard let url = URL(string: location.sourceURL) else { return }
        UIApplication.shared.open(url)
    }
}

private final class AppleTableAnnotation: NSObject, MKAnnotation {
    let location: AppleTableLocation

    init(location: AppleTableLocation) {
        self.location = location
        super.init()
    }

    var coordinate: CLLocationCoordinate2D { location.coordinate }
    var title: String? { location.name }
    var subtitle: String? { location.locality }
}

private final class AppleTableMapViewController: UIViewController,
    MKMapViewDelegate,
    UISearchBarDelegate,
    CLLocationManagerDelegate {

    var onSelectLocation: ((String) -> Void)?
    var onAddLocation: (() -> Void)?

    private let allLocations: [AppleTableLocation]
    private let initiallySelectedID: String?
    private let initialUserCoordinate: CLLocationCoordinate2D?
    private var filteredLocations: [AppleTableLocation] = []
    private var selectedLocation: AppleTableLocation?
    private let mapView = MKMapView()
    private let searchBar = UISearchBar()
    private let filterControl = UISegmentedControl(items: ["All", "Free", "Indoor", "Outdoor"])
    private let locationManager = CLLocationManager()
    private let resultCountLabel = UILabel()
    private let dataAttributionButton = UIButton(type: .system)
    private let cardTitleLabel = UILabel()
    private let cardSubtitleLabel = UILabel()
    private let cardTagsLabel = UILabel()
    private let detailsButton = UIButton(type: .system)
    private let directionsButton = UIButton(type: .system)
    private lazy var searchGlass = makeGlassView(interactive: true)
    private lazy var cardGlass = makeGlassView(interactive: true)
    private lazy var locateButton = makeLocateButton()

    init(
        locations: [AppleTableLocation],
        selectedID: String?,
        userCoordinate: CLLocationCoordinate2D?
    ) {
        allLocations = locations
        filteredLocations = locations
        initiallySelectedID = selectedID
        initialUserCoordinate = userCoordinate
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Find Tables"
        view.backgroundColor = .systemBackground
        configureNavigation()
        configureMap()
        configureSearchControls()
        configureSelectionCard()
        applyFilter(shouldFitMap: true)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        if let initiallySelectedID,
           let annotation = mapView.annotations
            .compactMap({ $0 as? AppleTableAnnotation })
            .first(where: { $0.location.id == initiallySelectedID }) {
            mapView.selectAnnotation(annotation, animated: true)
            focus(on: annotation.location.coordinate)
        }
    }

    private func configureNavigation() {
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            title: "Done",
            style: .done,
            target: self,
            action: #selector(closeMap)
        )
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            systemItem: .add,
            primaryAction: UIAction { [weak self] _ in self?.addLocation() }
        )
        navigationItem.rightBarButtonItem?.accessibilityLabel = "Add a table"
    }

    private func configureMap() {
        mapView.translatesAutoresizingMaskIntoConstraints = false
        mapView.delegate = self
        mapView.mapType = .standard
        mapView.showsCompass = true
        mapView.showsScale = false
        mapView.showsUserLocation = CLLocationManager.locationServicesEnabled()
        mapView.pointOfInterestFilter = MKPointOfInterestFilter(including: [
            .park,
            .fitnessCenter,
            .school,
            .cafe,
        ])
        mapView.register(
            MKMarkerAnnotationView.self,
            forAnnotationViewWithReuseIdentifier: "TableMarker"
        )
        view.addSubview(mapView)
        NSLayoutConstraint.activate([
            mapView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            mapView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            mapView.topAnchor.constraint(equalTo: view.topAnchor),
            mapView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func configureSearchControls() {
        searchGlass.translatesAutoresizingMaskIntoConstraints = false
        searchGlass.layer.cornerRadius = 22
        searchGlass.clipsToBounds = true
        view.addSubview(searchGlass)

        let container = searchGlass.contentView
        searchBar.translatesAutoresizingMaskIntoConstraints = false
        searchBar.delegate = self
        searchBar.placeholder = "Search tables or locations"
        searchBar.searchBarStyle = .minimal
        searchBar.autocapitalizationType = .words
        searchBar.returnKeyType = .search

        filterControl.translatesAutoresizingMaskIntoConstraints = false
        filterControl.selectedSegmentIndex = 0
        filterControl.addTarget(self, action: #selector(filterChanged), for: .valueChanged)

        resultCountLabel.translatesAutoresizingMaskIntoConstraints = false
        resultCountLabel.font = .preferredFont(forTextStyle: .caption1)
        resultCountLabel.textColor = .secondaryLabel
        resultCountLabel.adjustsFontForContentSizeCategory = true

        container.addSubview(searchBar)
        container.addSubview(filterControl)
        container.addSubview(resultCountLabel)

        locateButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(locateButton)

        dataAttributionButton.translatesAutoresizingMaskIntoConstraints = false
        var attributionConfiguration = UIButton.Configuration.plain()
        attributionConfiguration.title = "Table data © OpenStreetMap contributors"
        attributionConfiguration.image = UIImage(systemName: "info.circle")
        attributionConfiguration.imagePadding = 5
        attributionConfiguration.contentInsets = .zero
        dataAttributionButton.configuration = attributionConfiguration
        dataAttributionButton.titleLabel?.font = .systemFont(ofSize: 10, weight: .medium)
        dataAttributionButton.contentHorizontalAlignment = .leading
        dataAttributionButton.accessibilityHint = "Opens the OpenStreetMap copyright and license page"
        dataAttributionButton.addTarget(self, action: #selector(openDataAttribution), for: .touchUpInside)
        view.addSubview(dataAttributionButton)

        NSLayoutConstraint.activate([
            searchGlass.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 10),
            searchGlass.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 14),
            searchGlass.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -14),

            searchBar.topAnchor.constraint(equalTo: container.topAnchor, constant: 5),
            searchBar.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 5),
            searchBar.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -5),

            filterControl.topAnchor.constraint(equalTo: searchBar.bottomAnchor, constant: 1),
            filterControl.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 10),
            filterControl.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -10),

            resultCountLabel.topAnchor.constraint(equalTo: filterControl.bottomAnchor, constant: 8),
            resultCountLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 14),
            resultCountLabel.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -14),
            resultCountLabel.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -10),

            locateButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            locateButton.topAnchor.constraint(equalTo: searchGlass.bottomAnchor, constant: 12),
            locateButton.widthAnchor.constraint(equalToConstant: 48),
            locateButton.heightAnchor.constraint(equalToConstant: 48),

            dataAttributionButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 18),
            dataAttributionButton.trailingAnchor.constraint(lessThanOrEqualTo: locateButton.leadingAnchor, constant: -10),
            dataAttributionButton.centerYAnchor.constraint(equalTo: locateButton.centerYAnchor),
            dataAttributionButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 32),
        ])
    }

    private func configureSelectionCard() {
        cardGlass.translatesAutoresizingMaskIntoConstraints = false
        cardGlass.layer.cornerRadius = 24
        cardGlass.clipsToBounds = true
        view.addSubview(cardGlass)

        let container = cardGlass.contentView
        cardTitleLabel.translatesAutoresizingMaskIntoConstraints = false
        cardTitleLabel.font = .preferredFont(forTextStyle: .headline)
        cardTitleLabel.adjustsFontForContentSizeCategory = true
        cardTitleLabel.numberOfLines = 2

        cardSubtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        cardSubtitleLabel.font = .preferredFont(forTextStyle: .subheadline)
        cardSubtitleLabel.textColor = .secondaryLabel
        cardSubtitleLabel.adjustsFontForContentSizeCategory = true
        cardSubtitleLabel.numberOfLines = 2

        cardTagsLabel.translatesAutoresizingMaskIntoConstraints = false
        cardTagsLabel.font = .preferredFont(forTextStyle: .caption1)
        cardTagsLabel.textColor = .secondaryLabel
        cardTagsLabel.adjustsFontForContentSizeCategory = true
        cardTagsLabel.numberOfLines = 2

        configureActionButton(detailsButton, title: "Details", prominent: false)
        configureActionButton(directionsButton, title: "Directions", prominent: true)
        detailsButton.addTarget(self, action: #selector(showDetails), for: .touchUpInside)
        directionsButton.addTarget(self, action: #selector(openDirections), for: .touchUpInside)

        let buttonStack = UIStackView(arrangedSubviews: [detailsButton, directionsButton])
        buttonStack.translatesAutoresizingMaskIntoConstraints = false
        buttonStack.axis = .horizontal
        buttonStack.spacing = 10
        buttonStack.distribution = .fillEqually

        [cardTitleLabel, cardSubtitleLabel, cardTagsLabel, buttonStack].forEach {
            container.addSubview($0)
        }

        NSLayoutConstraint.activate([
            cardGlass.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 14),
            cardGlass.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -14),
            cardGlass.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -14),

            cardTitleLabel.topAnchor.constraint(equalTo: container.topAnchor, constant: 17),
            cardTitleLabel.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 18),
            cardTitleLabel.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -18),

            cardSubtitleLabel.topAnchor.constraint(equalTo: cardTitleLabel.bottomAnchor, constant: 4),
            cardSubtitleLabel.leadingAnchor.constraint(equalTo: cardTitleLabel.leadingAnchor),
            cardSubtitleLabel.trailingAnchor.constraint(equalTo: cardTitleLabel.trailingAnchor),

            cardTagsLabel.topAnchor.constraint(equalTo: cardSubtitleLabel.bottomAnchor, constant: 7),
            cardTagsLabel.leadingAnchor.constraint(equalTo: cardTitleLabel.leadingAnchor),
            cardTagsLabel.trailingAnchor.constraint(equalTo: cardTitleLabel.trailingAnchor),

            buttonStack.topAnchor.constraint(equalTo: cardTagsLabel.bottomAnchor, constant: 13),
            buttonStack.leadingAnchor.constraint(equalTo: cardTitleLabel.leadingAnchor),
            buttonStack.trailingAnchor.constraint(equalTo: cardTitleLabel.trailingAnchor),
            buttonStack.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -16),
            buttonStack.heightAnchor.constraint(greaterThanOrEqualToConstant: 44),
        ])

        updateSelectionCard()
    }

    private func makeGlassView(interactive: Bool) -> UIVisualEffectView {
        if #available(iOS 26.0, *) {
            let effect = UIGlassEffect(style: .regular)
            effect.isInteractive = interactive
            effect.tintColor = UIColor.systemBackground.withAlphaComponent(0.08)
            return UIVisualEffectView(effect: effect)
        }

        return UIVisualEffectView(effect: UIBlurEffect(style: .systemMaterial))
    }

    private func makeLocateButton() -> UIButton {
        let button = UIButton(type: .system)
        var configuration: UIButton.Configuration
        if #available(iOS 26.0, *) {
            configuration = .glass()
        } else {
            configuration = .filled()
            configuration.baseBackgroundColor = .systemBackground
        }
        configuration.image = UIImage(systemName: "location.fill")
        configuration.cornerStyle = .capsule
        button.configuration = configuration
        button.accessibilityLabel = "Show my location"
        button.addTarget(self, action: #selector(showUserLocation), for: .touchUpInside)
        return button
    }

    private func configureActionButton(
        _ button: UIButton,
        title: String,
        prominent: Bool
    ) {
        button.translatesAutoresizingMaskIntoConstraints = false
        var configuration: UIButton.Configuration
        if #available(iOS 26.0, *) {
            configuration = prominent ? .prominentGlass() : .glass()
        } else {
            configuration = prominent ? .filled() : .bordered()
        }
        configuration.title = title
        configuration.cornerStyle = .capsule
        if prominent {
            configuration.baseBackgroundColor = UIColor(
                red: 0.086,
                green: 0.498,
                blue: 0.745,
                alpha: 1
            )
        }
        button.configuration = configuration
    }

    @objc private func closeMap() {
        dismiss(animated: true)
    }

    @objc private func openDataAttribution() {
        guard let url = URL(string: "https://www.openstreetmap.org/copyright") else { return }
        UIApplication.shared.open(url)
    }

    private func addLocation() {
        dismiss(animated: true) { [weak self] in
            self?.onAddLocation?()
        }
    }

    @objc private func filterChanged() {
        applyFilter(shouldFitMap: true)
    }

    func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
        applyFilter(shouldFitMap: true)
    }

    func searchBarSearchButtonClicked(_ searchBar: UISearchBar) {
        searchBar.resignFirstResponder()
    }

    private func applyFilter(shouldFitMap: Bool) {
        let query = searchBar.text?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? ""

        filteredLocations = allLocations.filter { location in
            let matchesFilter: Bool
            switch filterControl.selectedSegmentIndex {
            case 1: matchesFilter = location.accessType == "free"
            case 2: matchesFilter = location.indoor
            case 3: matchesFilter = !location.indoor
            default: matchesFilter = true
            }

            guard matchesFilter else { return false }
            guard !query.isEmpty else { return true }
            return [
                location.name,
                location.address,
                location.city,
                location.region,
                location.venueLabel,
                location.accessLabel,
            ].contains { $0.lowercased().contains(query) }
        }

        let oldAnnotations = mapView.annotations.compactMap { $0 as? AppleTableAnnotation }
        mapView.removeAnnotations(oldAnnotations)
        let annotations = filteredLocations.map(AppleTableAnnotation.init)
        mapView.addAnnotations(annotations)

        if let selectedLocation,
           !filteredLocations.contains(where: { $0.id == selectedLocation.id }) {
            self.selectedLocation = nil
            updateSelectionCard()
        }

        resultCountLabel.text = "\(filteredLocations.count) \(filteredLocations.count == 1 ? "table" : "tables") found"

        guard shouldFitMap else { return }
        if let initialUserCoordinate, searchBar.text?.isEmpty != false,
           filterControl.selectedSegmentIndex == 0 {
            focus(on: initialUserCoordinate)
        } else if !annotations.isEmpty {
            mapView.showAnnotations(annotations, animated: true)
        } else {
            mapView.setRegion(
                MKCoordinateRegion(
                    center: CLLocationCoordinate2D(latitude: 39.8283, longitude: -98.5795),
                    span: MKCoordinateSpan(latitudeDelta: 45, longitudeDelta: 55)
                ),
                animated: true
            )
        }
    }

    private func focus(on coordinate: CLLocationCoordinate2D) {
        mapView.setRegion(
            MKCoordinateRegion(
                center: coordinate,
                latitudinalMeters: 18_000,
                longitudinalMeters: 18_000
            ),
            animated: true
        )
    }

    private func updateSelectionCard() {
        guard let selectedLocation else {
            cardTitleLabel.text = "Explore public tables"
            cardSubtitleLabel.text = filteredLocations.isEmpty
                ? "No tables match these filters."
                : "Tap a table pin to see details."
            cardTagsLabel.text = "Search by venue, city, state, or address"
            detailsButton.isHidden = true
            directionsButton.isHidden = true
            return
        }

        cardTitleLabel.text = selectedLocation.name
        cardSubtitleLabel.text = selectedLocation.fullAddress
        let ratingText = selectedLocation.rating.map { String(format: "%.1f ★", $0) } ?? "New"
        let tableText = "\(selectedLocation.tableCount) \(selectedLocation.tableCount == 1 ? "table" : "tables")"
        cardTagsLabel.text = [
            selectedLocation.indoor ? "Indoor" : "Outdoor",
            selectedLocation.accessLabel,
            tableText,
            ratingText,
        ].joined(separator: "  ·  ")
        detailsButton.isHidden = false
        directionsButton.isHidden = false
    }

    @objc private func showDetails() {
        guard let selectedLocation else { return }
        let detailsController = AppleTableDetailsViewController(location: selectedLocation)
        navigationController?.pushViewController(detailsController, animated: true)
    }

    @objc private func openDirections() {
        guard let selectedLocation else { return }
        let placemark = MKPlacemark(coordinate: selectedLocation.coordinate)
        let item = MKMapItem(placemark: placemark)
        item.name = selectedLocation.name
        item.openInMaps(launchOptions: [
            MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving,
        ])
    }

    @objc private func showUserLocation() {
        switch locationManager.authorizationStatus {
        case .notDetermined:
            locationManager.delegate = self
            locationManager.requestWhenInUseAuthorization()
        case .authorizedAlways, .authorizedWhenInUse:
            locationManager.delegate = self
            locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
            locationManager.requestLocation()
        case .denied, .restricted:
            let alert = UIAlertController(
                title: "Location is off",
                message: "Allow location access in Settings to center the map near you.",
                preferredStyle: .alert
            )
            alert.addAction(UIAlertAction(title: "OK", style: .default))
            present(alert, animated: true)
        @unknown default:
            break
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedAlways ||
            manager.authorizationStatus == .authorizedWhenInUse {
            mapView.showsUserLocation = true
            manager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let coordinate = locations.last?.coordinate else { return }
        focus(on: coordinate)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // The map remains fully usable when an exact device location is unavailable.
    }

    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard let tableAnnotation = annotation as? AppleTableAnnotation else { return nil }
        let view = mapView.dequeueReusableAnnotationView(
            withIdentifier: "TableMarker",
            for: tableAnnotation
        ) as! MKMarkerAnnotationView
        view.canShowCallout = false
        view.markerTintColor = UIColor(red: 0.055, green: 0.62, blue: 0.61, alpha: 1)
        view.glyphTintColor = .white
        view.glyphImage = UIImage(systemName: "figure.table.tennis")
            ?? UIImage(systemName: "sportscourt.fill")
        view.clusteringIdentifier = "table"
        view.displayPriority = .required
        return view
    }

    func mapView(_ mapView: MKMapView, didSelect view: MKAnnotationView) {
        guard let annotation = view.annotation as? AppleTableAnnotation else { return }
        selectedLocation = annotation.location
        updateSelectionCard()
        UISelectionFeedbackGenerator().selectionChanged()
    }
}

@objc(AppleTableMapPlugin)
public final class AppleTableMapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleTableMapPlugin"
    public let jsName = "AppleTableMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise),
    ]

    @objc func present(_ call: CAPPluginCall) {
        guard let rawLocations = call.getArray("locations", JSObject.self) else {
            call.reject("Table locations are required.")
            return
        }

        let locations = rawLocations.compactMap(AppleTableLocation.init)
        let selectedID = call.getString("selectedLocationId")
        let userLatitude = call.getDouble("userLatitude")
        let userLongitude = call.getDouble("userLongitude")
        let userCoordinate: CLLocationCoordinate2D?

        if let userLatitude, let userLongitude,
           (-90...90).contains(userLatitude),
           (-180...180).contains(userLongitude) {
            userCoordinate = CLLocationCoordinate2D(
                latitude: userLatitude,
                longitude: userLongitude
            )
        } else {
            userCoordinate = nil
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("The Apple map could not be presented.")
                return
            }

            let mapController = AppleTableMapViewController(
                locations: locations,
                selectedID: selectedID,
                userCoordinate: userCoordinate
            )
            mapController.onSelectLocation = { [weak self] id in
                self?.notifyListeners("locationSelected", data: ["id": id])
            }
            mapController.onAddLocation = { [weak self] in
                self?.notifyListeners("addLocationRequested", data: [:])
            }

            let navigationController = UINavigationController(rootViewController: mapController)
            navigationController.modalPresentationStyle = .fullScreen
            presenter.present(navigationController, animated: true) {
                call.resolve()
            }
        }
    }
}
