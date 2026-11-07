import ActivityKit
import Foundation

/// The charge as a Live Activity: what never changes during one charge, and
/// what the server updates (server/apns.js sends the same field names).
/// Add this file to BOTH targets: App and VoliLiveActivity.
struct ChargeAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// "live", "done" or "stopped".
        var stage: String
        /// 0–100, or -1 when the car does not report it.
        var pct: Int
        var energy: String
        var cost: String
        var power: String
        var status: String
        var left: String
        var lEnergy: String
        var lCost: String
        var lPower: String
        var uKwh: String
        var uSum: String
        var uKw: String
    }

    var sessionId: String
    var station: String
    var sub: String
}
