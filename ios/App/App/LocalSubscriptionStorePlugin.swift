// This bridge cannot exist in an App Store build or on a physical device.
// RevenueCat remains the production billing path; this is a local test harness.
#if DEBUG && targetEnvironment(simulator)
import Capacitor
import StoreKit
import StoreKitTest

@objc(LocalSubscriptionStorePlugin)
public class LocalSubscriptionStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalSubscriptionStorePlugin"
    public let jsName = "LocalSubscriptionStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "expire", returnType: CAPPluginReturnPromise)
    ]

    private var session: SKTestSession?
    private var updates: Task<Void, Never>?
    private var busy = false
    private let productsByPlan = [
        "plus": "com.tabletalktabletennis.local.leagueplus.monthly",
        "pro": "com.tabletalktabletennis.local.leaguepro.monthly"
    ]

    deinit { updates?.cancel() }

    // Called only by the hosted XCTest target, where Apple's test daemon is
    // available. This resets local test transactions, never real purchases.
    @MainActor
    func performSelfCheck() async throws -> [String] {
        var checks: [String] = []
        let testSession = try SKTestSession(configurationFileNamed: "TableTalkPlans")
        testSession.resetToDefaultState()
        testSession.clearTransactions()
        testSession.disableDialogs = true
        self.session = testSession
        let products = try await Product.products(for: Array(productsByPlan.values))
        guard products.count == 2 else { throw LocalStoreError("Both products did not load.") }
        try await requireLocalEnvironment()
        checks.append("local configuration and localized products loaded")
        try await checkPlan("free")
        for plan in ["plus", "pro"] {
            guard let product = products.first(where: { $0.id == productsByPlan[plan] }) else {
                throw LocalStoreError("Test product missing.")
            }
            guard case .success(let verification) = try await product.purchase(),
                  case .verified(let transaction) = verification,
                  isLocal(transaction) else {
                throw LocalStoreError("Test purchase was not locally verified.")
            }
            await transaction.finish()
            try await checkPlan(plan)
            checks.append(plan + " purchase verified")
            try await AppStore.sync()
            try await checkPlan(plan)
            checks.append(plan + " restore verified")
        }
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, isLocal(transaction) {
                try testSession.expireSubscription(productIdentifier: transaction.productID)
            }
        }
        try await checkPlan("free")
        checks.append("expiration returns local access to free")
        try await AppStore.sync()
        try await checkPlan("free")
        checks.append("restore does not revive expired access")
        return checks
    }

    private func checkPlan(_ expected: String) async throws {
        for _ in 0..<20 {
            if await snapshot()["plan"] as? String == expected { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw LocalStoreError("Expected local plan " + expected + " was not returned.")
    }

    @objc func start(_ call: CAPPluginCall) {
        run(call) {
            if self.session == nil {
                // Fail closed: a missing/invalid local config never falls back
                // to App Store products or a real purchase environment.
                let localSession = try SKTestSession(configurationFileNamed: "TableTalkPlans")
                localSession.disableDialogs = false
                self.session = localSession
                self.updates = Task { [weak self] in
                    for await result in Transaction.updates {
                        guard !Task.isCancelled, let self else { return }
                        guard case .verified(let transaction) = result,
                              self.isLocal(transaction) else { continue }
                        await transaction.finish()
                        self.notifyListeners("changed", data: ["environment": "xcode-local"])
                    }
                }
            }
            let products = try await Product.products(for: Array(self.productsByPlan.values))
            guard products.count == self.productsByPlan.count else {
                throw LocalStoreError("Local test products are unavailable. Open the App Local Billing scheme in Xcode. Some iOS simulator versions cannot initialize Apple's local test store.")
            }
            try await self.requireLocalEnvironment()
            var result = await self.snapshot()
            result["products"] = products.map { product in
                [
                    "plan": self.productsByPlan.first(where: { $0.value == product.id })!.key,
                    "productId": product.id,
                    "displayPrice": product.displayPrice
                ]
            }
            return result
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        run(call) {
            try self.requireSession()
            return await self.snapshot()
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        run(call) {
            try self.requireSession()
            try await self.requireLocalEnvironment()
            guard let plan = call.getString("plan"),
                  let id = self.productsByPlan[plan] else {
                throw LocalStoreError("Choose a valid local test plan.")
            }
            guard let product = try await Product.products(for: [id]).first else {
                throw LocalStoreError("That local test product is unavailable.")
            }
            let outcome: String
            switch try await product.purchase() {
            case .success(let verification):
                guard case .verified(let transaction) = verification,
                      self.isLocal(transaction) else {
                    throw LocalStoreError("The test transaction could not be verified.")
                }
                await transaction.finish()
                outcome = "purchased"
            case .pending:
                outcome = "pending"
            case .userCancelled:
                outcome = "cancelled"
            @unknown default:
                throw LocalStoreError("The test purchase returned an unknown result.")
            }
            var result = await self.snapshot()
            result["outcome"] = outcome
            return result
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        run(call) {
            try self.requireSession()
            try await self.requireLocalEnvironment()
            // Only user-initiated, and only after SKTestSession is active.
            try await AppStore.sync()
            var result = await self.snapshot()
            result["outcome"] = "restored"
            return result
        }
    }

    @objc func expire(_ call: CAPPluginCall) {
        run(call) {
            try self.requireSession()
            try await self.requireLocalEnvironment()
            for await result in Transaction.currentEntitlements {
                guard case .verified(let transaction) = result,
                      self.isLocal(transaction) else { continue }
                try self.session!.expireSubscription(productIdentifier: transaction.productID)
            }
            var result = await self.snapshot()
            result["outcome"] = "expired"
            return result
        }
    }

    private func requireSession() throws {
        guard session != nil else {
            throw LocalStoreError("Start the local test store first.")
        }
    }

    private func requireLocalEnvironment() async throws {
        // A test-session object alone is insufficient on affected simulators.
        // Refuse purchase/restore unless StoreKit verifies the Xcode environment.
        if #available(iOS 16.0, *),
           case .verified(let app) = try await AppTransaction.shared,
           app.environment == .xcode { return }
        throw LocalStoreError("Apple's local Xcode store is not active. No purchase or restore was attempted.")
    }

    private func isLocal(_ transaction: Transaction) -> Bool {
        guard productsByPlan.values.contains(transaction.productID) else { return false }
        if #available(iOS 16.0, *) {
            return transaction.environment == .xcode
        }
        return session != nil
    }

    private func snapshot() async -> [String: Any] {
        var plan = "free"
        var end: String?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result,
                  isLocal(transaction),
                  transaction.revocationDate == nil,
                  !transaction.isUpgraded,
                  let expiration = transaction.expirationDate,
                  expiration > Date() else { continue }
            let candidate = productsByPlan.first(where: { $0.value == transaction.productID })!.key
            if plan == "free" || candidate == "pro" {
                plan = candidate
                end = ISO8601DateFormatter().string(from: expiration)
            }
        }
        return [
            "environment": "xcode-local",
            "plan": plan,
            "currentPeriodEnd": end as Any? ?? NSNull()
        ]
    }

    private func run(
        _ call: CAPPluginCall,
        operation: @escaping () async throws -> [String: Any]
    ) {
        Task { @MainActor in
            guard !self.busy else {
                call.reject("Another test-store action is still in progress.")
                return
            }
            self.busy = true
            defer { self.busy = false }
            do { call.resolve(try await operation()) }
            catch { call.reject(error.localizedDescription) }
        }
    }
}

private struct LocalStoreError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
#endif
