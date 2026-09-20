package com.appliance.clock;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView mWebView;
    private Vibrator mVibrator;
    private SoundPool mSoundPool;

    private final BroadcastReceiver mBatteryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            boolean isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING
                    || status == BatteryManager.BATTERY_STATUS_FULL;
            final float batteryPct = level >= 0 && scale > 0
                    ? (level / (float) scale) * 100f
                    : 100f;

            if (mWebView != null) {
                mWebView.post(() -> mWebView.evaluateJavascript(
                        String.format(
                                "window.onNativeBatteryUpdate && window.onNativeBatteryUpdate(%b, %.1f);",
                                isCharging,
                                batteryPct
                        ),
                        null
                ));
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.activity_main);
        setupImmersiveMode();

        mVibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        setupAudio();
        mWebView = findViewById(R.id.webview);
        setupWebView();
        registerReceiver(mBatteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
    }

    private void setupWebView() {
    WebSettings settings = mWebView.getSettings();

    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setAllowFileAccess(true);
    settings.setAllowContentAccess(true);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
        WebView.setWebContentsDebuggingEnabled(true);
    }

    mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

    mWebView.addJavascriptInterface(
            new ApplianceBridge(this),
            "AndroidAppliance"
    );

    mWebView.setWebChromeClient(new android.webkit.WebChromeClient() {
        @Override
        public boolean onConsoleMessage(
                android.webkit.ConsoleMessage consoleMessage) {

            android.util.Log.d(
                    "FlipClockWebView",
                    consoleMessage.message()
                            + " -- "
                            + consoleMessage.sourceId()
                            + ":"
                            + consoleMessage.lineNumber()
            );

            return true;
        }
    });

    mWebView.setWebViewClient(new WebViewClient() {
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);

            view.evaluateJavascript(
                    "(function() {" +
                    "return JSON.stringify({" +
                    "url: location.href," +
                    "stylesheets: Array.from(document.styleSheets).map(function(s) { return s.href; })," +
                    "scripts: Array.from(document.scripts).map(function(s) { return s.src; })," +
                    "body: document.body ? document.body.innerText.substring(0,200) : 'NO BODY'" +
                    "});" +
                    "})()",
                    value -> android.util.Log.d("FlipClockWebView", "PAGE=" + value)
            );
        }
    });

    mWebView.loadUrl(
            "file:///android_asset/www/index.html"
    );
}

    private void setupImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    private void setupAudio() {
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        mSoundPool = new SoundPool.Builder()
                .setMaxStreams(3)
                .setAudioAttributes(audioAttributes)
                .build();
        // The web layer synthesizes alarm audio; no res/raw asset is required.
    }

    @Override
    protected void onDestroy() {
        unregisterReceiver(mBatteryReceiver);
        if (mSoundPool != null) mSoundPool.release();
        super.onDestroy();
    }

    public class ApplianceBridge {
        private final Context context;

        ApplianceBridge(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public boolean isNative() {
            return true;
        }

        @JavascriptInterface
        public void triggerHaptic(int durationMs) {
            if (mVibrator == null || !mVibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mVibrator.vibrate(VibrationEffect.createOneShot(
                        durationMs,
                        VibrationEffect.DEFAULT_AMPLITUDE
                ));
            } else {
                mVibrator.vibrate(durationMs);
            }
        }

        @JavascriptInterface
        public void setScreenBrightness(float brightnessRatio) {
            runOnUiThread(() -> {
                WindowManager.LayoutParams layout = getWindow().getAttributes();
                layout.screenBrightness = Math.max(0.01f, Math.min(1.0f, brightnessRatio));
                getWindow().setAttributes(layout);
            });
        }

        @JavascriptInterface
        public void setKeepScreenAwake(boolean keepAwake) {
            runOnUiThread(() -> {
                if (keepAwake) {
                    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        public void scheduleExactAlarm(String alarmId, long triggerAtMillis, String label) {
            AlarmScheduler.scheduleExact(context, alarmId, triggerAtMillis, label);
        }

        @JavascriptInterface
        public void cancelAlarm(String alarmId) {
            AlarmScheduler.cancel(context, alarmId);
        }

        @JavascriptInterface
        public void playAlarmRingtone() {
            // Alarm audio is synthesized by the bundled web app.
        }

        @JavascriptInterface
        public void stopAlarmRingtone() {
            if (mSoundPool != null) mSoundPool.autoPause();
        }
    }
}