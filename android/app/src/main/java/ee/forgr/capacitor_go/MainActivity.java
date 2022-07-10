package ee.forgr.capacitor_go;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.hardware.SensorManager;

import ee.forgr.capacitor_updater.BundleInfo;
import ee.forgr.capacitor_updater.CapacitorUpdater;

import com.android.volley.toolbox.Volley;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.plugin.WebView;
import com.squareup.seismic.ShakeDetector;

import java.text.MessageFormat;

public class MainActivity extends BridgeActivity implements ShakeDetector.Listener {

    private SharedPreferences prefs;
    private SharedPreferences.Editor editor;
    Boolean isShow = false;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        SensorManager sensorManager = (SensorManager) getSystemService(SENSOR_SERVICE);
        ShakeDetector sd = new ShakeDetector(this);
        sd.start(sensorManager);
    }

    @Override
    public void onStart() {
        super.onStart();
        this.prefs = this.bridge.getContext().getSharedPreferences("CapWebViewSettings", Activity.MODE_PRIVATE);
        this.editor = prefs.edit();
    }

    @Override public void hearShake() {
        Log.i("Capgo", "hearShake");
        CapacitorUpdater updater = new CapacitorUpdater();
        updater.prefs = this.bridge.getContext().getSharedPreferences(WebView.WEBVIEW_PREFS_NAME, Activity.MODE_PRIVATE);
        updater.editor = this.prefs.edit();
        updater.documentsDir = this.bridge.getContext().getFilesDir();
        updater.requestQueue = Volley.newRequestQueue(this.bridge.getContext());
        if (isShow) {
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
                BundleInfo current = updater.getCurrentBundle();
                Log.i(CapacitorUpdater.TAG, "get next: ");
                BundleInfo next = updater.getNextBundle();
                Log.i(CapacitorUpdater.TAG, "next: " + next.toString());
                if (!next.isBuiltin()) {
                    updater.set(next.getId());
                } else {
                    updater.reset();
                }
                final String path = updater.getCurrentBundlePath();
                Log.i(CapacitorUpdater.TAG, "Reloading: " + path);
                if(updater.isUsingBuiltin()) {
                    brd.setServerAssetPath(path);
                } else {
                    brd.setServerBasePath(path);
                }
                try {
                    updater.delete(current.getId());
                } catch (Exception err) {
                    Log.i("Capgo", "Cannot delete version " + current.getId(), err);
                }
                Log.i("Capgo", "Capgo: Reload app done");
                dialog.dismiss();
                isShow = false;
            }
        });
        builder.setNeutralButton(reloadButtonTitle, new DialogInterface.OnClickListener() {
            public void onClick(DialogInterface dialog, int id) {
                Log.i("Capgo", reloadButtonTitle);
                String pathHot = updater.getCurrentBundlePath();
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