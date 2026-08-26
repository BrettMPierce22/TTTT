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
        TabDefinition(name: "tournaments", title: "Tourney", symbol: "medal", selectedSymbol: "medal.fill"),
        TabDefinition(name: "record", title: "Record", symbol: "plus.circle", selectedSymbol: "plus.circle.fill"),
        TabDefinition(name: "tables", title: "Tables", symbol: "mappin.and.ellipse", selectedSymbol: "mappin.and.ellipse"),
        TabDefinition(name: "profile", title: "Me", symbol: "person.crop.circle", selectedSymbol: "person.crop.circle.fill")
    ]

    private let bridgeController = TableTalkViewController()
    private let floatingChatButton = UIButton(type: .system)
    private let floatingChatBadge = UILabel()
    weak var nativeShellPlugin: NativeShellPlugin?

    override func viewDidLoad() {
        super.viewDidLoad()

        delegate = self
        view.backgroundColor = .systemBackground
        configureNativeTabs()
        configureFloatingChatButton()
        embedBridgeController()
        setTabsVisible(false)

        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior = .never
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.bringSubviewToFront(tabBar)
        view.bringSubviewToFront(floatingChatButton)
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

    private func configureFloatingChatButton() {
        floatingChatButton.translatesAutoresizingMaskIntoConstraints = false

        var configuration: UIButton.Configuration
        if #available(iOS 26.0, *) {
            configuration = .glass()
        } else {
            configuration = .filled()
            configuration.baseBackgroundColor = .secondarySystemBackground
        }
        configuration.image = UIImage(systemName: "bubble.left.and.bubble.right.fill")
        configuration.preferredSymbolConfigurationForImage = UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)
        configuration.cornerStyle = .capsule
        configuration.baseForegroundColor = UIColor(red: 0.086, green: 0.498, blue: 0.745, alpha: 1)
        floatingChatButton.configuration = configuration
        floatingChatButton.accessibilityLabel = "Open league chat"
        floatingChatButton.addTarget(self, action: #selector(openChat), for: .touchUpInside)

        floatingChatBadge.translatesAutoresizingMaskIntoConstraints = false
        floatingChatBadge.backgroundColor = .systemRed
        floatingChatBadge.textColor = .white
        floatingChatBadge.textAlignment = .center
        floatingChatBadge.font = .systemFont(ofSize: 10, weight: .bold)
        floatingChatBadge.layer.cornerRadius = 9
        floatingChatBadge.layer.masksToBounds = true
        floatingChatBadge.isHidden = true
        floatingChatBadge.accessibilityElementsHidden = true

        view.addSubview(floatingChatButton)
        floatingChatButton.addSubview(floatingChatBadge)

        NSLayoutConstraint.activate([
            floatingChatButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            floatingChatButton.bottomAnchor.constraint(equalTo: tabBar.topAnchor, constant: -4),
            floatingChatButton.widthAnchor.constraint(equalToConstant: 46),
            floatingChatButton.heightAnchor.constraint(equalToConstant: 46),

            floatingChatBadge.topAnchor.constraint(equalTo: floatingChatButton.topAnchor, constant: -3),
            floatingChatBadge.trailingAnchor.constraint(equalTo: floatingChatButton.trailingAnchor, constant: 3),
            floatingChatBadge.widthAnchor.constraint(greaterThanOrEqualToConstant: 18),
            floatingChatBadge.heightAnchor.constraint(equalToConstant: 18),
        ])
    }

    private func updateFloatingChatAppearance(selected: Bool) {
        guard var configuration = floatingChatButton.configuration else { return }
        configuration.baseForegroundColor = selected ? .white : UIColor(
            red: 0.086,
            green: 0.498,
            blue: 0.745,
            alpha: 1
        )
        configuration.baseBackgroundColor = selected ? UIColor(
            red: 0.086,
            green: 0.498,
            blue: 0.745,
            alpha: 1
        ) : nil
        floatingChatButton.configuration = configuration
    }

    @objc private func openChat() {
        updateFloatingChatAppearance(selected: true)
        nativeShellPlugin?.notifyTabSelected("chat")
    }

    private func embedBridgeController() {
        addChild(bridgeController)
        bridgeController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        attachBridgeView(to: selectedViewController)
        bridgeController.didMove(toParent: self)
    }

    private func attachBridgeView(to host: UIViewController?) {
        guard let host else { return }
        bridgeController.view.frame = host.view.bounds
        host.view.addSubview(bridgeController.view)
    }

    func setTabsVisible(_ visible: Bool) {
        tabBar.isHidden = !visible
        floatingChatButton.isHidden = !visible
        view.setNeedsLayout()
    }

    @discardableResult
    func selectTab(named name: String) -> Bool {
        if name == "chat" {
            updateFloatingChatAppearance(selected: true)
            return true
        }

        guard let index = definitions.firstIndex(where: { $0.name == name }) else {
            return false
        }

        updateFloatingChatAppearance(selected: false)
        selectedIndex = index
        attachBridgeView(to: selectedViewController)
        view.bringSubviewToFront(tabBar)
        view.bringSubviewToFront(floatingChatButton)
        return true
    }

    @discardableResult
    func setBadge(_ value: Int, for name: String) -> Bool {
        if name == "chat" {
            floatingChatBadge.text = value > 99 ? "99+" : String(value)
            floatingChatBadge.isHidden = value <= 0
            return true
        }

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
        updateFloatingChatAppearance(selected: false)
        nativeShellPlugin?.notifyTabSelected(tab)
        view.bringSubviewToFront(tabBar)
        view.bringSubviewToFront(floatingChatButton)
    }
}
