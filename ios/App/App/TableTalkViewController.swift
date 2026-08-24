import Capacitor

class TableTalkViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AddressGeocoderPlugin())

        let nativeShell = NativeShellPlugin()
        nativeShell.shellController = parent as? TableTalkTabBarController
        (parent as? TableTalkTabBarController)?.nativeShellPlugin = nativeShell
        bridge?.registerPluginInstance(nativeShell)
    }
}
