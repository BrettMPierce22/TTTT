import Capacitor

class TableTalkViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AddressGeocoderPlugin())
    }
}
