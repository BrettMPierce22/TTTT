import XCTest
@testable import App

final class LocalBillingTests: XCTestCase {
    @MainActor
    func testLocalPurchasesRestoreAndExpiration() async throws {
        let store = LocalSubscriptionStorePlugin()
        let checks = try await store.performSelfCheck()
        XCTAssertEqual(checks, [
            "local configuration and localized products loaded",
            "plus purchase verified",
            "plus restore verified",
            "pro purchase verified",
            "pro restore verified",
            "expiration returns local access to free",
            "restore does not revive expired access"
        ])
    }
}
