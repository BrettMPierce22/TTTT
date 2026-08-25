import Capacitor

@objc(NativeShellPlugin)
public class NativeShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeShellPlugin"
    public let jsName = "NativeShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTabsVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSelectedTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTabBadge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHeaderState", returnType: CAPPluginReturnPromise)
    ]

    weak var shellController: TableTalkTabBarController?

    @objc func setTabsVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible", false)
        DispatchQueue.main.async {
            self.shellController?.setTabsVisible(visible)
            call.resolve()
        }
    }

    @objc func setSelectedTab(_ call: CAPPluginCall) {
        guard let tab = call.getString("tab") else {
            call.reject("A tab name is required.")
            return
        }

        DispatchQueue.main.async {
            guard self.shellController?.selectTab(named: tab) == true else {
                call.reject("Unknown native tab.")
                return
            }
            call.resolve()
        }
    }

    @objc func setTabBadge(_ call: CAPPluginCall) {
        guard let tab = call.getString("tab") else {
            call.reject("A tab name is required.")
            return
        }

        let value = call.getInt("value", 0)
        DispatchQueue.main.async {
            guard self.shellController?.setBadge(value, for: tab) == true else {
                call.reject("Unknown native tab.")
                return
            }
            call.resolve()
        }
    }

    @objc func setHeaderState(_ call: CAPPluginCall) {
        let visible = call.getBool("visible", false)
        let title = call.getString("title", "")
        let subtitle = call.getString("subtitle", "")
        let leagueCode = call.getString("leagueCode", "")
        let showModerator = call.getBool("showModerator", false)

        DispatchQueue.main.async {
            self.shellController?.setHeaderState(
                visible: visible,
                title: title,
                subtitle: subtitle,
                leagueCode: leagueCode,
                showModerator: showModerator
            )
            call.resolve()
        }
    }

    func notifyTabSelected(_ tab: String) {
        notifyListeners("tabSelected", data: ["tab": tab])
    }

    func notifyActionSelected(_ action: String) {
        notifyListeners("actionSelected", data: ["action": action])
    }
}
