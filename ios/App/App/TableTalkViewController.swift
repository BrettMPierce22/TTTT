import Capacitor

class TableTalkViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AddressGeocoderPlugin())
        bridge?.registerPluginInstance(AppleTableMapPlugin())
#if DEBUG && targetEnvironment(simulator)
        bridge?.registerPluginInstance(LocalSubscriptionStorePlugin())
#endif

        let nativeShell = NativeShellPlugin()
        nativeShell.shellController = parent as? TableTalkTabBarController
        (parent as? TableTalkTabBarController)?.nativeShellPlugin = nativeShell
        bridge?.registerPluginInstance(nativeShell)
    }
}
