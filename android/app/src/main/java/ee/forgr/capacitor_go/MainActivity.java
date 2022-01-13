package ee.forgr.capacitor_go;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.hardware.SensorManager;
import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.util.Log;
import com.squareup.seismic.ShakeDetector;

import java.text.MessageFormat;

public class MainActivity extends BridgeActivity implements ShakeDetector.Listener {
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SensorManager sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        ShakeDetector sd = new ShakeDetector(this);
        sd.start(sensorManager);
    }

    @Override public void hearShake() {
        Log.i("Capacitor Go", "hearShake");
        Object[] params = new Object[]{"app", "!"};
        String msg = MessageFormat.format("Preview {0} Menu", params);
        String message = "What would you like to do ?";
        String okButtonTitle = "Go Home";
        String reloadButtonTitle = "Reload app";
        String cancelButtonTitle = "Close menu";
//        Object updater = CapacitorUpdater()
        AlertDialog.Builder builder = new AlertDialog.Builder(this.bridge.getActivity());
        builder.setMessage(message);
        builder.setTitle(msg);
        builder.setPositiveButton(okButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                // User clicked OK button
                Log.i("Capacitor Go", "okButtonTitle");
                dialog.dismiss();
            }
        });
        builder.setNeutralButton(reloadButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                Log.i("Capacitor Go", "reloadButtonTitle");
                dialog.dismiss();
            }
        });
        builder.setNegativeButton(cancelButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                Log.i("Capacitor Go", "cancelButtonTitle");
                dialog.dismiss();
            }
        });
        AlertDialog dialog = builder.create();
        dialog.show();
    }
}