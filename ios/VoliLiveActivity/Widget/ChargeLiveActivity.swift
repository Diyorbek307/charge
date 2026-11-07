import ActivityKit
import SwiftUI
import WidgetKit

/// The charge on the iPhone lock screen and in the Dynamic Island, the same
/// card as on Android (android/…/push/ChargeNotice.java): near-black, the
/// percentage in Voli yellow, a charge bar, energy, cost and power.
private let yellow = Color(red: 1.0, green: 0.784, blue: 0.239)      // #FFC83D
private let ink = Color(red: 0.067, green: 0.067, blue: 0.067)        // #111111
private let muted = Color(white: 0.6)

private struct Bolt: View {
    var size: CGFloat = 40
    var body: some View {
        ZStack {
            Circle().fill(LinearGradient(colors: [Color(red: 1, green: 0.84, blue: 0.42), Color(red: 1, green: 0.69, blue: 0)], startPoint: .topLeading, endPoint: .bottomTrailing))
            Image(systemName: "bolt.fill").font(.system(size: size * 0.45, weight: .bold)).foregroundColor(ink)
        }
        .frame(width: size, height: size)
    }
}

private struct Bar: View {
    let pct: Int
    let running: Bool
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(white: 0.17))
                Capsule()
                    .fill(LinearGradient(colors: [Color(red: 1, green: 0.906, blue: 0.627), yellow, Color(red: 1, green: 0.69, blue: 0)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: g.size.width * CGFloat(max(pct, running ? 4 : 0)) / 100)
            }
        }
        .frame(height: 9)
    }
}

private func pctText(_ s: ChargeAttributes.ContentState) -> String {
    s.pct >= 0 ? "\(s.pct)%" : (s.stage == "done" ? "✓" : "⚡")
}

private struct Numbers: View {
    let s: ChargeAttributes.ContentState
    var body: some View {
        HStack(alignment: .top) {
            column(s.lEnergy, "\(s.energy) \(s.uKwh)", .leading)
            Spacer()
            column(s.lCost, "\(s.cost) \(s.uSum)", .center)
            Spacer()
            if !s.power.isEmpty { column(s.lPower, "\(s.power) \(s.uKw)", .trailing) }
        }
    }
    private func column(_ label: String, _ value: String, _ align: HorizontalAlignment) -> some View {
        VStack(alignment: align, spacing: 2) {
            Text(label).font(.system(size: 12)).foregroundColor(muted)
            Text(value).font(.system(size: 15, weight: .bold)).foregroundColor(.white).monospacedDigit()
        }
    }
}

struct ChargeLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ChargeAttributes.self) { context in
            // Lock screen and banner.
            let s = context.state
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Bolt()
                    VStack(alignment: .leading, spacing: 1) {
                        Text(context.attributes.station).font(.system(size: 17, weight: .bold)).foregroundColor(.white).lineLimit(1)
                        Text(context.attributes.sub).font(.system(size: 13)).foregroundColor(muted).lineLimit(1)
                    }
                    Spacer(minLength: 8)
                    Text(pctText(s)).font(.system(size: 34, weight: .heavy)).foregroundColor(yellow).monospacedDigit()
                }
                Bar(pct: s.pct, running: s.stage == "live")
                Numbers(s: s)
                Text(s.stage == "live" && !s.left.isEmpty ? "⚡ \(s.status) · \(s.left)" : (s.stage == "live" ? "⚡ \(s.status)" : s.status))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(Color(red: 1, green: 0.906, blue: 0.627))
                    .lineLimit(1)
            }
            .padding(16)
            .activityBackgroundTint(ink)
            .activitySystemActionForegroundColor(yellow)
        } dynamicIsland: { context in
            let s = context.state
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { Bolt(size: 34) }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(pctText(s)).font(.system(size: 28, weight: .heavy)).foregroundColor(yellow).monospacedDigit()
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.station).font(.system(size: 15, weight: .bold)).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        Bar(pct: s.pct, running: s.stage == "live")
                        Numbers(s: s)
                    }
                }
            } compactLeading: {
                Image(systemName: "bolt.fill").foregroundColor(yellow)
            } compactTrailing: {
                Text(pctText(s)).font(.system(size: 14, weight: .bold)).foregroundColor(yellow).monospacedDigit()
            } minimal: {
                Image(systemName: "bolt.fill").foregroundColor(yellow)
            }
            .keylineTint(yellow)
        }
    }
}

@main
struct VoliLiveActivityBundle: WidgetBundle {
    var body: some Widget {
        ChargeLiveActivity()
    }
}
