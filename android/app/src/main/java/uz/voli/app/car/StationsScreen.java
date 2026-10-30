package uz.voli.app.car;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.text.SpannableString;
import android.text.Spanned;

import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.CarToast;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.CarColor;
import androidx.car.app.model.CarLocation;
import androidx.car.app.model.Distance;
import androidx.car.app.model.DistanceSpan;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.Metadata;
import androidx.car.app.model.Place;
import androidx.car.app.model.PlaceListMapTemplate;
import androidx.car.app.model.PlaceMarker;
import androidx.car.app.model.Row;
import androidx.car.app.model.Template;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;

import java.util.Collections;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import uz.voli.app.R;

/**
 * Stations nearby on the car's screen: name, free/total, the cheapest price
 * and the distance; a free station is marked green on the map. Refreshed
 * every minute while shown.
 */
public final class StationsScreen extends Screen implements DefaultLifecycleObserver {
    private static final double TASHKENT_LAT = 41.3111;
    private static final double TASHKENT_LNG = 69.2797;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private List<StationsRepo.Station> stations = null;
    private String error = null;
    private final Runnable refresh = this::load;

    public StationsScreen(@NonNull CarContext carContext) {
        super(carContext);
        getLifecycle().addObserver(this);
    }

    @Override
    public void onStart(@NonNull LifecycleOwner owner) {
        load();
    }

    @Override
    public void onStop(@NonNull LifecycleOwner owner) {
        main.removeCallbacks(refresh);
    }

    @Override
    public void onDestroy(@NonNull LifecycleOwner owner) {
        io.shutdownNow();
    }

    /** The phone's last known position, when the driver allowed it in the app; Tashkent otherwise. */
    private double[] here() {
        CarContext ctx = getCarContext();
        if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            LocationManager lm = (LocationManager) ctx.getSystemService(CarContext.LOCATION_SERVICE);
            try {
                for (String p : new String[] {LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER}) {
                    Location l = lm.getLastKnownLocation(p);
                    if (l != null) return new double[] {l.getLatitude(), l.getLongitude()};
                }
            } catch (SecurityException ignored) {
                // Permission withdrawn meanwhile.
            }
        }
        return new double[] {TASHKENT_LAT, TASHKENT_LNG};
    }

    private void load() {
        main.removeCallbacks(refresh);
        final double[] at = here();
        final String server = getCarContext().getString(R.string.voli_server);
        io.execute(() -> {
            List<StationsRepo.Station> next;
            String err = null;
            try {
                next = StationsRepo.nearby(server, at[0], at[1], 6);
            } catch (Exception e) {
                next = stations == null ? Collections.emptyList() : stations;
                err = "Нет связи с Voli";
            }
            final List<StationsRepo.Station> result = next;
            final String failure = err;
            main.post(() -> {
                stations = result;
                error = failure;
                invalidate();
                main.postDelayed(refresh, 60_000);
            });
        });
    }

    @NonNull
    @Override
    public Template onGetTemplate() {
        PlaceListMapTemplate.Builder t = new PlaceListMapTemplate.Builder()
                .setTitle("Voli · станции рядом")
                .setHeaderAction(Action.APP_ICON)
                .setCurrentLocationEnabled(true)
                .setActionStrip(new ActionStrip.Builder()
                        .addAction(new Action.Builder().setTitle("Обновить").setOnClickListener(this::load).build())
                        .build());
        if (stations == null) return t.setLoading(true).build();

        ItemList.Builder items = new ItemList.Builder();
        if (stations.isEmpty()) {
            items.setNoItemsMessage(error != null ? error : "Рядом нет работающих станций");
        }
        for (StationsRepo.Station s : stations) {
            SpannableString distance = new SpannableString("  ·  " + s.operator);
            distance.setSpan(DistanceSpan.create(Distance.create(s.km, s.km < 10 ? Distance.UNIT_KILOMETERS_P1 : Distance.UNIT_KILOMETERS)), 0, 1, Spanned.SPAN_INCLUSIVE_INCLUSIVE);
            String line = s.free > 0
                    ? s.free + "/" + s.total + " свободно · до " + s.maxKw + " кВт · от " + s.price + " сум"
                    : "Все заняты · до " + s.maxKw + " кВт";
            Place place = new Place.Builder(CarLocation.create(s.lat, s.lng))
                    .setMarker(new PlaceMarker.Builder().setColor(s.free > 0 ? CarColor.GREEN : CarColor.RED).build())
                    .build();
            items.addItem(new Row.Builder()
                    .setTitle(s.name)
                    .addText(distance)
                    .addText(line)
                    .setMetadata(new Metadata.Builder().setPlace(place).build())
                    .setOnClickListener(() -> navigate(s))
                    .build());
        }
        return t.setItemList(items.build()).build();
    }

    /** The way there goes to the car's own navigation app. */
    private void navigate(StationsRepo.Station s) {
        try {
            getCarContext().startCarApp(new Intent(CarContext.ACTION_NAVIGATE, Uri.parse("geo:" + s.lat + "," + s.lng + "?q=" + Uri.encode(s.name))));
        } catch (Exception e) {
            CarToast.makeText(getCarContext(), "Не удалось открыть навигацию", CarToast.LENGTH_LONG).show();
        }
    }
}
