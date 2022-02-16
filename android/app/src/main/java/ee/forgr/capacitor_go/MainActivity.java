package ee.forgr.capacitor_go;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.hardware.SensorManager;
import ee.forgr.capacitor_updater.CapacitorUpdater;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.util.Log;
import com.squareup.seismic.ShakeDetector;

import java.io.File;
import java.text.MessageFormat;

public class MainActivity extends BridgeActivity implements ShakeDetector.Listener {

    Boolean isShow = false;
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SensorManager sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        ShakeDetector sd = new ShakeDetector(this);
        sd.start(sensorManager);
    }

    @Override public void hearShake() {
        Log.i("Capgo", "hearShake");
        CapacitorUpdater updater = new CapacitorUpdater(this.bridge.getContext());
        if (updater.getLastPathHot() == "" || isShow) {
            return;
        }
        isShow = true;
        Bridge brd = this.bridge;
        Object[] params = new Object[]{"app", "!"};
        String msg = MessageFormat.format("Preview {0} Menu", params);
        String message = "What would you like to do ?";
        String okButtonTitle = "Go Home";
        String reloadButtonTitle = "Reload app";
        String cancelButtonTitle = "Close menu";
        AlertDialog.Builder builder = new AlertDialog.Builder(this.bridge.getActivity());
        builder.setMessage(message);
        builder.setTitle(msg);
        builder.setPositiveButton(okButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                // User clicked OK button
                Log.i("Capgo", okButtonTitle);
                String serverBasePath = updater.getLastPathHot();
                File fHot = new File(serverBasePath);
                String versionName = updater.getVersionName();
                updater.reset();
                String pathHot = updater.getLastPathHot();
                brd.setServerAssetPath(pathHot);
                try {
                    String name = fHot.getName();
                    updater.delete(name, versionName);
                } catch (Exception err) {
                    Log.i("Capgo", "Cannot delete version", err);
                }
                dialog.dismiss();
                isShow = false;
            }
        });
        builder.setNeutralButton(reloadButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                Log.i("Capgo", reloadButtonTitle);
                String pathHot = updater.getLastPathHot();
                brd.setServerBasePath(pathHot);
                dialog.dismiss();
                isShow = false;
            }
        });
        builder.setNegativeButton(cancelButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                Log.i("Capgo", cancelButtonTitle);
                dialog.dismiss();
                isShow = false;
            }
        });
        AlertDialog dialog = builder.create();
        dialog.show();
    }
}