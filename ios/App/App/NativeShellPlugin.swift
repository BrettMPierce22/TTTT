import Capacitor
import UIKit

@objc(NativeShellPlugin)
public class NativeShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeShellPlugin"
    public let jsName = "NativeShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTabsVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSelectedTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTabBadge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "shareCsvReport", returnType: CAPPluginReturnPromise)
    ]

    weak var shellController: TableTalkTabBarController?
    private var sharingReport = false

    @objc func shareCsvReport(_ call: CAPPluginCall) {
        guard let filename = call.getString("filename"),
              filename.range(of: "^[a-zA-Z0-9-]+\\.csv$", options: .regularExpression) != nil,
              filename.count <= 120,
              let csv = call.getString("csv"),
              let data = csv.data(using: .utf8), data.count <= 2_000_000 else {
            call.reject("Invalid report or report too large. Choose a shorter period.")
            return
        }
        DispatchQueue.main.async {
            guard !self.sharingReport,
                  let presenter = self.bridge?.viewController,
                  presenter.view.window != nil,
                  presenter.presentedViewController == nil else {
                call.reject("Close the open window before sharing a report.")
                return
            }
            self.sharingReport = true
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("table-talk-report-" + UUID().uuidString, isDirectory: true)
            do {
                try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
                let file = directory.appendingPathComponent(filename)
                try data.write(to: file, options: .atomic)
                let activity = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                activity.popoverPresentationController?.sourceView = presenter.view
                activity.popoverPresentationController?.sourceRect = CGRect(
                    x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1
                )
                activity.completionWithItemsHandler = { _, completed, _, error in
                    // Delete only this generated temporary report, never user files.
                    try? FileManager.default.removeItem(at: directory)
                    self.sharingReport = false
                    if let error { call.reject(error.localizedDescription) }
                    else { call.resolve(["shared": completed]) }
                }
                presenter.present(activity, animated: true)
            } catch {
                try? FileManager.default.removeItem(at: directory)
                self.sharingReport = false
                call.reject("Could not prepare the report for sharing.")
            }
        }
    }

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

    func notifyTabSelected(_ tab: String) {
        notifyListeners("tabSelected", data: ["tab": tab])
    }

}
