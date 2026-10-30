package uz.voli.app.car;

import android.content.pm.ApplicationInfo;

import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

/**
 * Voli on the car's screen (Android Auto), in the "charging" category:
 * the stations nearby with free connectors and prices, and a tap hands the
 * way there to the car's navigation app.
 */
public final class VoliCarAppService extends CarAppService {
    @NonNull
    @Override
    public HostValidator createHostValidator() {
        // Debug builds talk to any host (the Desktop Head Unit); release builds only to Android Auto itself.
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            return HostValidator.ALLOW_ALL_HOSTS_VALIDATOR;
        }
        return new HostValidator.Builder(getApplicationContext())
                .addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample)
                .build();
    }

    @NonNull
    @Override
    public Session onCreateSession() {
        return new Session() {
            @NonNull
            @Override
            public androidx.car.app.Screen onCreateScreen(@NonNull android.content.Intent intent) {
                return new StationsScreen(getCarContext());
            }
        };
    }
}
