package ee.forgr.capacitor_go;

import android.app.Activity;
import android.content.SharedPreferences;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {

    private SharedPreferences prefs;
    private SharedPreferences.Editor editor;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStart() {
        super.onStart();
        this.prefs = this.bridge.getContext().getSharedPreferences("CapWebViewSettings", Activity.MODE_PRIVATE);
        this.editor = prefs.edit();
    }
}
