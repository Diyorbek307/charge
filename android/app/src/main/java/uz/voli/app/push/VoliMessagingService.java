package uz.voli.app.push;

import androidx.annotation.NonNull;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Firebase messages for the app. The charge's live card arrives as data and
 * is drawn here (ChargeNotice), even with the app closed; everything else
 * goes on to the Capacitor plugin as before.
 */
public class VoliMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        if ("charge".equals(data.get("kind"))) {
            ChargeNotice.show(this, data);
            return;
        }
        super.onMessageReceived(message);
    }
}
