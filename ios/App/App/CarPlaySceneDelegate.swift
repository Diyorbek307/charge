import CarPlay
import CoreLocation
import UIKit

/// Voli on the car's screen (CarPlay, EV charging category): the stations
/// nearby with free connectors and prices; "Маршрут" hands the way there to
/// the car's maps. Needs Apple's CarPlay EV Charging entitlement.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate, CLLocationManagerDelegate {
    private var interfaceController: CPInterfaceController?
    private var scene: CPTemplateApplicationScene?
    private let location = CLLocationManager()
    private var timer: Timer?
    private let template = CPPointOfInterestTemplate(title: "Voli", pointsOfInterest: [], selectedIndex: NSNotFound)

    /// The Voli server the stations come from (set in Info.plist as VoliServer).
    private var server: String {
        (Bundle.main.object(forInfoDictionaryKey: "VoliServer") as? String) ?? "https://charge-qogf.onrender.com"
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didConnect interfaceController: CPInterfaceController) {
        self.scene = scene
        self.interfaceController = interfaceController
        location.delegate = self
        interfaceController.setRootTemplate(template, animated: false, completion: nil)
        load()
        timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.load() }
    }

    func templateApplicationScene(_ scene: CPTemplateApplicationScene, didDisconnectInterfaceController interfaceController: CPInterfaceController) {
        timer?.invalidate()
        timer = nil
        self.interfaceController = nil
        self.scene = nil
    }

    private struct Station {
        let id: String, name: String, operatorName: String, lat: Double, lng: Double
        let free: Int, total: Int, maxKw: Int, price: Int
    }

    private func load() {
        let here = location.location?.coordinate ?? CLLocationCoordinate2D(latitude: 41.3111, longitude: 69.2797)
        guard let url = URL(string: "\(server)/api/state") else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self, let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let list = json["stations"] as? [[String: Any]] else { return }
            let stations: [Station] = list.compactMap { s in
                guard (s["private"] as? Bool) != true,
                      let id = s["id"] as? String, let name = s["name"] as? String,
                      let lat = s["geoLat"] as? Double, let lng = s["geoLng"] as? Double,
                      let conns = s["connectors"] as? [[String: Any]] else { return nil }
                let working = conns.filter { ($0["status"] as? String) != "unavailable" }
                if working.isEmpty { return nil }
                return Station(
                    id: id, name: name, operatorName: s["operator"] as? String ?? "", lat: lat, lng: lng,
                    free: conns.filter { ($0["status"] as? String) == "available" }.count, total: conns.count,
                    maxKw: conns.compactMap { $0["power"] as? Int }.max() ?? 0,
                    price: conns.compactMap { $0["price"] as? Int }.min() ?? 0)
            }
            let origin = CLLocation(latitude: here.latitude, longitude: here.longitude)
            let nearest = stations
                .sorted { a, b in
                    if (a.free > 0) != (b.free > 0) { return a.free > 0 }
                    return origin.distance(from: CLLocation(latitude: a.lat, longitude: a.lng)) < origin.distance(from: CLLocation(latitude: b.lat, longitude: b.lng))
                }
                .prefix(12)
            DispatchQueue.main.async { self.show(Array(nearest), from: origin) }
        }.resume()
    }

    private func show(_ stations: [Station], from origin: CLLocation) {
        let points: [CPPointOfInterest] = stations.map { s in
            let placemark = MKPlacemarkLite.item(lat: s.lat, lng: s.lng, name: s.name)
            let km = origin.distance(from: CLLocation(latitude: s.lat, longitude: s.lng)) / 1000
            let status = s.free > 0 ? "\(s.free)/\(s.total) свободно · до \(s.maxKw) кВт" : "Все заняты · до \(s.maxKw) кВт"
            let poi = CPPointOfInterest(
                location: placemark,
                title: s.name,
                subtitle: String(format: "%.1f км · %@", km, s.operatorName),
                summary: status,
                detailTitle: s.name,
                detailSubtitle: status,
                detailSummary: s.price > 0 ? "от \(s.price) сум/кВт·ч" : nil,
                pinImage: nil)
            poi.primaryButton = CPTextButton(title: "Маршрут", textStyle: .confirm) { [weak self] _ in
                guard let url = URL(string: "maps://?daddr=\(s.lat),\(s.lng)") else { return }
                self?.scene?.open(url, options: nil, completionHandler: nil)
            }
            return poi
        }
        template.setPointsOfInterest(points, selectedIndex: NSNotFound)
    }
}

import MapKit

/// A map item for a point of interest.
private enum MKPlacemarkLite {
    static func item(lat: Double, lng: Double, name: String) -> MKMapItem {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng)))
        item.name = name
        return item
    }
}
