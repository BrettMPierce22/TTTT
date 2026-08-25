import UIKit

final class TableTalkTabBarController: UITabBarController, UITabBarControllerDelegate {
    private struct TabDefinition {
        let name: String
        let title: String
        let symbol: String
        let selectedSymbol: String
    }

    private let definitions = [
        TabDefinition(name: "leaderboard", title: "Board", symbol: "trophy", selectedSymbol: "trophy.fill"),
        TabDefinition(name: "tables", title: "Tables", symbol: "map", selectedSymbol: "map.fill"),
        TabDefinition(name: "record", title: "Record", symbol: "plus.circle", selectedSymbol: "plus.circle.fill"),
        TabDefinition(name: "chat", title: "Chat", symbol: "bubble.left.and.bubble.right", selectedSymbol: "bubble.left.and.bubble.right.fill"),
        TabDefinition(name: "profile", title: "Me", symbol: "person.crop.circle", selectedSymbol: "person.crop.circle.fill")
    ]

    private let bridgeController = TableTalkViewController()
    private let headerGlassView = UIVisualEffectView(effect: nil)
    private let headerTitleLabel = UILabel()
    private let headerSubtitleLabel = UILabel()
    private let headerHomeButton = UIButton(type: .system)
    private let headerMenuButton = UIButton(type: .system)
    private var headerLeagueCode = ""
    private var headerShowsModerator = false
#if DEBUG
    private let previewsNativeChrome = ProcessInfo.processInfo.arguments.contains("--preview-native-chrome")
#endif
    weak var nativeShellPlugin: NativeShellPlugin?

    override func viewDidLoad() {
        super.viewDidLoad()

        delegate = self
        view.backgroundColor = .systemBackground
        configureNativeTabs()
        configureNativeHeader()
        embedBridgeController()
        setTabsVisible(false)
        setHeaderState(visible: false, title: "", subtitle: "", leagueCode: "", showModerator: false)

#if DEBUG
        if previewsNativeChrome {
            setTabsVisible(true)
            setHeaderState(
                visible: true,
                title: "Thursday Night League",
                subtitle: "Table Talk Table Tennis",
                leagueCode: "TTTT26",
                showModerator: true
            )
        }
#endif

        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior = .onScrollDown
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.bringSubviewToFront(headerGlassView)
        view.bringSubviewToFront(tabBar)
    }

    private func configureNativeTabs() {
        viewControllers = definitions.enumerated().map { index, definition in
            let host = UIViewController()
            host.view.backgroundColor = .clear
            host.restorationIdentifier = definition.name
            host.tabBarItem = UITabBarItem(
                title: definition.title,
                image: UIImage(systemName: definition.symbol),
                selectedImage: UIImage(systemName: definition.selectedSymbol)
            )
            host.tabBarItem.tag = index
            return host
        }

        // Keep UIKit's unmodified standard appearance. Building with the iOS 26
        // SDK lets UITabBarController supply the real Liquid Glass material,
        // motion, vibrancy, and platform fallback behavior.
        tabBar.isTranslucent = true
        tabBar.tintColor = UIColor(red: 0.086, green: 0.498, blue: 0.745, alpha: 1)
        selectedIndex = 0
    }

    private func embedBridgeController() {
        addChild(bridgeController)
        bridgeController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        attachBridgeView(to: selectedViewController)
        bridgeController.didMove(toParent: self)
    }

    private func configureNativeHeader() {
        headerGlassView.translatesAutoresizingMaskIntoConstraints = false
        headerGlassView.clipsToBounds = true
        headerGlassView.layer.cornerCurve = .continuous
        headerGlassView.layer.cornerRadius = 28

        if #available(iOS 26.0, *) {
            let glass = UIGlassEffect(style: .regular)
            glass.isInteractive = true
            headerGlassView.effect = glass
        } else {
            headerGlassView.effect = UIBlurEffect(style: .systemMaterial)
        }

        let labels = UIStackView(arrangedSubviews: [headerTitleLabel, headerSubtitleLabel])
        labels.axis = .vertical
        labels.alignment = .leading
        labels.spacing = 1
        labels.translatesAutoresizingMaskIntoConstraints = false

        headerTitleLabel.font = .preferredFont(forTextStyle: .headline)
        headerTitleLabel.adjustsFontForContentSizeCategory = true
        headerTitleLabel.textColor = .label
        headerTitleLabel.lineBreakMode = .byTruncatingTail

        headerSubtitleLabel.font = .preferredFont(forTextStyle: .caption1)
        headerSubtitleLabel.adjustsFontForContentSizeCategory = true
        headerSubtitleLabel.textColor = .secondaryLabel
        headerSubtitleLabel.lineBreakMode = .byTruncatingTail

        configureHeaderButton(headerHomeButton, symbol: "square.grid.2x2")
        headerHomeButton.accessibilityLabel = "My Leagues"
        headerHomeButton.addTarget(self, action: #selector(openMyLeagues), for: .touchUpInside)

        configureHeaderButton(headerMenuButton, symbol: "ellipsis")
        headerMenuButton.accessibilityLabel = "League menu"
        headerMenuButton.showsMenuAsPrimaryAction = true

        let content = headerGlassView.contentView
        content.addSubview(headerHomeButton)
        content.addSubview(labels)
        content.addSubview(headerMenuButton)
        view.addSubview(headerGlassView)

        NSLayoutConstraint.activate([
            headerGlassView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 6),
            headerGlassView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            headerGlassView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            headerGlassView.heightAnchor.constraint(equalToConstant: 64),

            headerHomeButton.leadingAnchor.constraint(equalTo: content.leadingAnchor, constant: 10),
            headerHomeButton.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            headerHomeButton.widthAnchor.constraint(equalToConstant: 44),
            headerHomeButton.heightAnchor.constraint(equalToConstant: 44),

            labels.leadingAnchor.constraint(equalTo: headerHomeButton.trailingAnchor, constant: 8),
            labels.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            labels.trailingAnchor.constraint(lessThanOrEqualTo: headerMenuButton.leadingAnchor, constant: -8),

            headerMenuButton.trailingAnchor.constraint(equalTo: content.trailingAnchor, constant: -10),
            headerMenuButton.centerYAnchor.constraint(equalTo: content.centerYAnchor),
            headerMenuButton.widthAnchor.constraint(equalToConstant: 44),
            headerMenuButton.heightAnchor.constraint(equalToConstant: 44)
        ])
    }

    private func configureHeaderButton(_ button: UIButton, symbol: String) {
        button.translatesAutoresizingMaskIntoConstraints = false
        var configuration = UIButton.Configuration.plain()
        configuration.image = UIImage(systemName: symbol)
        configuration.baseForegroundColor = .label
        configuration.cornerStyle = .capsule
        button.configuration = configuration
    }

    private func updateHeaderMenu() {
        var children = [
            UIAction(title: "Tournaments", image: UIImage(systemName: "trophy")) { [weak self] _ in
                self?.notifyAction("tournaments")
            },
            UIAction(title: "Copy League Code", subtitle: headerLeagueCode, image: UIImage(systemName: "doc.on.doc")) { [weak self] _ in
                self?.notifyAction("copyLeagueCode")
            },
            UIAction(title: "Support & Safety", image: UIImage(systemName: "lifepreserver")) { [weak self] _ in
                self?.notifyAction("support")
            }
        ]

        if headerShowsModerator {
            children.append(
                UIAction(title: "Moderator Queue", image: UIImage(systemName: "checklist")) { [weak self] _ in
                    self?.notifyAction("moderation")
                }
            )
        }

        children.append(
            UIAction(title: "Sign Out", image: UIImage(systemName: "rectangle.portrait.and.arrow.right"), attributes: .destructive) { [weak self] _ in
                self?.notifyAction("signOut")
            }
        )

        headerMenuButton.menu = UIMenu(children: children)
    }

    @objc private func openMyLeagues() {
        notifyAction("myLeagues")
    }

    private func notifyAction(_ action: String) {
        nativeShellPlugin?.notifyActionSelected(action)
    }

    func setHeaderState(
        visible: Bool,
        title: String,
        subtitle: String,
        leagueCode: String,
        showModerator: Bool
    ) {
#if DEBUG
        if previewsNativeChrome && !visible { return }
#endif
        headerTitleLabel.text = title
        headerSubtitleLabel.text = subtitle
        headerLeagueCode = leagueCode
        headerShowsModerator = showModerator
        updateHeaderMenu()
        headerGlassView.isHidden = !visible
        view.bringSubviewToFront(headerGlassView)
        view.bringSubviewToFront(tabBar)
    }

    private func attachBridgeView(to host: UIViewController?) {
        guard let host else { return }
        bridgeController.view.frame = host.view.bounds
        host.view.addSubview(bridgeController.view)
    }

    func setTabsVisible(_ visible: Bool) {
#if DEBUG
        if previewsNativeChrome && !visible { return }
#endif
        tabBar.isHidden = !visible
        view.setNeedsLayout()
    }

    @discardableResult
    func selectTab(named name: String) -> Bool {
        guard let index = definitions.firstIndex(where: { $0.name == name }) else {
            return false
        }

        selectedIndex = index
        attachBridgeView(to: selectedViewController)
        view.bringSubviewToFront(tabBar)
        return true
    }

    @discardableResult
    func setBadge(_ value: Int, for name: String) -> Bool {
        guard let index = definitions.firstIndex(where: { $0.name == name }),
              let item = tabBar.items?[index] else {
            return false
        }

        item.badgeValue = value > 0 ? (value > 99 ? "99+" : String(value)) : nil
        return true
    }

    func tabBarController(
        _ tabBarController: UITabBarController,
        didSelect viewController: UIViewController
    ) {
        guard let tab = viewController.restorationIdentifier else { return }
        attachBridgeView(to: viewController)
        nativeShellPlugin?.notifyTabSelected(tab)
        view.bringSubviewToFront(tabBar)
    }
}
