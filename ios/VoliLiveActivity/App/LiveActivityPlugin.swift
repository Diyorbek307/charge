import ActivityKit
import Capacitor
import Foundation

/// The bridge from the web app (src/lib/liveActivity.ts) to ActivityKit:
/// start the charge's Live Activity, hand its push token to the server so
/// Apple can update it with the app closed, end it. Add to the App target and
/// register in AppDelegate/bridge (see docs/ios-live-activity.md).
@objc(LiveActivityPlugin)
public class LiveActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LiveActivityPlugin"
    public let jsName = "LiveActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
    ]

    @objc func available(_ call: CAPPluginCall) {
        if #available(iOS 16.2, *) {
            call.resolve(["available": ActivityAuthorizationInfo().areActivitiesEnabled])
        } else {
            call.resolve(["available": false])
        }
    }

    /// start({ sessionId, station, sub, state }) → { pushToken } once Apple issues it.
    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.reject("Live Activities need iOS 16.2") }
        guard let sessionId = call.getString("sessionId"), let station = call.getString("station") else {
            return call.reject("sessionId and station are required")
        }
        let raw = call.getObject("state") ?? [:]
        let str = { (k: String) in (raw[k] as? String) ?? "" }
        let state = ChargeAttributes.ContentState(
            stage: str("stage").isEmpty ? "live" : str("stage"), pct: (raw["pct"] as? Int) ?? -1,
            energy: str("energy"), cost: str("cost"), power: str("power"), status: str("status"), left: str("left"),
            lEnergy: str("lEnergy"), lCost: str("lCost"), lPower: str("lPower"), uKwh: str("uKwh"), uSum: str("uSum"), uKw: str("uKw"))
        let attrs = ChargeAttributes(sessionId: sessionId, station: station, sub: call.getString("sub") ?? "")
        do {
            // One card per charge: an older one for the same charge is replaced.
            for a in Activity<ChargeAttributes>.activities where a.attributes.sessionId == sessionId {
                Task { await a.end(nil, dismissalPolicy: .immediate) }
            }
            let activity = try Activity.request(attributes: attrs, content: .init(state: state, staleDate: nil), pushType: .token)
            Task {
                for await data in activity.pushTokenUpdates {
                    let token = data.map { String(format: "%02x", $0) }.joined()
                    self.notifyListeners("pushToken", data: ["sessionId": sessionId, "token": token])
                    call.resolve(["pushToken": token])
                    break
                }
            }
        } catch {
            call.reject("Could not start the Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { return call.resolve() }
        let sessionId = call.getString("sessionId")
        for a in Activity<ChargeAttributes>.activities where sessionId == nil || a.attributes.sessionId == sessionId {
            Task { await a.end(nil, dismissalPolicy: .default) }
        }
        call.resolve()
    }
}
