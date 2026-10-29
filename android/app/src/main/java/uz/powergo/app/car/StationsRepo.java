package uz.powergo.app.car;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** The stations from the PowerGo server, the same public list the map shows. */
final class StationsRepo {
    static final class Station {
        final String id;
        final String name;
        final String operator;
        final double lat;
        final double lng;
        final int free;
        final int total;
        final int maxKw;
        final int price;
        double km;

        Station(String id, String name, String operator, double lat, double lng, int free, int total, int maxKw, int price) {
            this.id = id;
            this.name = name;
            this.operator = operator;
            this.lat = lat;
            this.lng = lng;
            this.free = free;
            this.total = total;
            this.maxKw = maxKw;
            this.price = price;
        }
    }

    private StationsRepo() {}

    /** Nearest first from (lat, lng); stations with a free connector before full ones. Blocking: call off the main thread. */
    static List<Station> nearby(String server, double lat, double lng, int limit) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(server + "/api/state").openConnection();
        c.setConnectTimeout(8000);
        c.setReadTimeout(12000);
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            JSONArray list = new JSONObject(out.toString("UTF-8")).getJSONArray("stations");
            List<Station> all = new ArrayList<>();
            for (int i = 0; i < list.length(); i++) {
                JSONObject s = list.getJSONObject(i);
                if (s.optBoolean("private", false)) continue;
                JSONArray conns = s.getJSONArray("connectors");
                int free = 0, maxKw = 0, price = Integer.MAX_VALUE, working = 0;
                for (int k = 0; k < conns.length(); k++) {
                    JSONObject cn = conns.getJSONObject(k);
                    String status = cn.optString("status");
                    if (!"unavailable".equals(status)) working++;
                    if ("available".equals(status)) free++;
                    maxKw = Math.max(maxKw, cn.optInt("power"));
                    price = Math.min(price, cn.optInt("price", Integer.MAX_VALUE));
                }
                if (working == 0) continue;
                Station st = new Station(s.getString("id"), s.getString("name"), s.optString("operator"), s.getDouble("geoLat"), s.getDouble("geoLng"), free, conns.length(), maxKw, price == Integer.MAX_VALUE ? 0 : price);
                st.km = km(lat, lng, st.lat, st.lng);
                all.add(st);
            }
            Collections.sort(all, (a, b) -> a.free > 0 == b.free > 0 ? Double.compare(a.km, b.km) : a.free > 0 ? -1 : 1);
            return all.subList(0, Math.min(limit, all.size()));
        } finally {
            c.disconnect();
        }
    }

    static double km(double aLat, double aLng, double bLat, double bLng) {
        double r = Math.PI / 180;
        double h = Math.pow(Math.sin((bLat - aLat) * r / 2), 2) + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.pow(Math.sin((bLng - aLng) * r / 2), 2);
        return 12742 * Math.asin(Math.sqrt(h));
    }
}
