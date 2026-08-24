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
    weak var nativeShellPlugin: NativeShellPlugin?

#if DEBUG
    private let forceTabsForVisualTesting = ProcessInfo.processInfo.arguments.contains("-showNativeTabs")
#else
    private let forceTabsForVisualTesting = false
#endif

    override func viewDidLoad() {
        super.viewDidLoad()

        delegate = self
        view.backgroundColor = .systemBackground
        configureNativeTabs()
        embedBridgeController()
        setTabsVisible(false)

        if #available(iOS 26.0, *) {
            tabBarMinimizeBehavior = .onScrollDown
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        view.bringSubviewToFront(tabBar)
    }

    private func configureNativeTabs() {
        viewControllers = definitions.enumerated().map { index, definition in
            let host = UIViewController()
            host.view.backgroundColor = .clear
            host.view.isUserInteractionEnabled = false
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

    private func attachBridgeView(to host: UIViewController?) {
        guard let host else { return }
        bridgeController.view.frame = host.view.bounds
        host.view.addSubview(bridgeController.view)
    }

    func setTabsVisible(_ visible: Bool) {
        tabBar.isHidden = forceTabsForVisualTesting ? false : !visible
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
