package com.appliance.clock;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

public class MainActivity extends Activity {

    private static final String TAG = "FlipClockWebView";

    private WebView mWebView;
    private Vibrator mVibrator;
    private SoundPool mSoundPool;

    private final BroadcastReceiver mBatteryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {

            int level = intent.getIntExtra(
                    BatteryManager.EXTRA_LEVEL,
                    -1
            );

            int scale = intent.getIntExtra(
                    BatteryManager.EXTRA_SCALE,
                    -1
            );

            int status = intent.getIntExtra(
                    BatteryManager.EXTRA_STATUS,
                    -1
            );

            boolean isCharging =
                    status == BatteryManager.BATTERY_STATUS_CHARGING
                            || status == BatteryManager.BATTERY_STATUS_FULL;

            final float batteryPct =
                    level >= 0 && scale > 0
                            ? (level / (float) scale) * 100f
                            : 100f;

            if (mWebView != null) {
                mWebView.post(() -> mWebView.evaluateJavascript(
                        String.format(
                                "window.onNativeBatteryUpdate && " +
                                        "window.onNativeBatteryUpdate(%b, %.1f);",
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

        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        setContentView(R.layout.activity_main);

        setupImmersiveMode();

        mVibrator = (Vibrator) getSystemService(
                Context.VIBRATOR_SERVICE
        );

        setupAudio();

        mWebView = findViewById(R.id.webview);

        setupWebView();

        registerReceiver(
                mBatteryReceiver,
                new IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        );
    }

    private void setupWebView() {

        WebSettings settings = mWebView.getSettings();

        // JavaScript / storage
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // We are no longer using file:// URLs.
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // Keep local assets cached normally.
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Enable Chromium/WebView debugging.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        mWebView.setLayerType(
                View.LAYER_TYPE_HARDWARE,
                null
        );

        // Native bridge exposed to the React application.
        mWebView.addJavascriptInterface(
                new ApplianceBridge(this),
                "AndroidAppliance"
        );

        /*
         * Serve android/app/src/main/assets/ through a proper HTTPS origin.
         *
         * Example:
         *
         * https://appassets.androidplatform.net/assets/www/index.html
         *
         * maps to:
         *
         * android/app/src/main/assets/www/index.html
         */
        final WebViewAssetLoader assetLoader =
                new WebViewAssetLoader.Builder()
                        .addPathHandler(
                                "/assets/",
                                new WebViewAssetLoader.AssetsPathHandler(this)
                        )
                        .build();

        /*
         * JavaScript console logging.
         */
        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(
                    ConsoleMessage consoleMessage
            ) {

                Log.d(
                        TAG,
                        consoleMessage.message()
                                + " -- "
                                + consoleMessage.sourceId()
                                + ":"
                                + consoleMessage.lineNumber()
                );

                return true;
            }
        });

        /*
         * WebViewAssetLoader handles all requests to:
         *
         * https://appassets.androidplatform.net/assets/...
         */
        mWebView.setWebViewClient(new WebViewClientCompat() {

            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    WebResourceRequest request
            ) {
                return assetLoader.shouldInterceptRequest(
                        request.getUrl()
                );
            }

            /*
             * Compatibility overload for older WebView versions.
             */
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    String url
            ) {
                return assetLoader.shouldInterceptRequest(
                        Uri.parse(url)
                );
            }

            @Override
            public void onPageFinished(
                    WebView view,
                    String url
            ) {
                super.onPageFinished(view, url);

                Log.d(
                        TAG,
                        "PAGE FINISHED: " + url
                );

                /*
                 * Inspect the actual page after it finishes loading.
                 *
                 * This tells us:
                 * - what URL WebView loaded
                 * - whether the stylesheet loaded
                 * - how many CSS rules WebView parsed
                 * - which scripts were loaded
                 * - whether the DOM exists
                 */
                view.evaluateJavascript(
                        "(function() {" +

                                "return JSON.stringify({" +

                                "url: location.href," +

                                "title: document.title," +

                                "stylesheets: Array.from(document.styleSheets).map(function(s) {" +
                                "try {" +
                                "return {" +
                                "href: s.href," +
                                "rules: s.cssRules.length" +
                                "};" +
                                "} catch(e) {" +
                                "return {" +
                                "href: s.href," +
                                "error: String(e)" +
                                "};" +
                                "}" +
                                "})," +

                                "scripts: Array.from(document.scripts).map(function(s) {" +
                                "return s.src;" +
                                "})," +

                                "body: document.body " +
                                "? document.body.innerText.substring(0,200) " +
                                ": 'NO BODY'" +

                                "});" +

                                "})()",

                        value -> Log.d(
                                TAG,
                                "PAGE=" + value
                        )
                );
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    android.webkit.WebResourceError error
            ) {
                super.onReceivedError(
                        view,
                        request,
                        error
                );

                Log.e(
                        TAG,
                        "RESOURCE ERROR: "
                                + request.getUrl()
                                + " | "
                                + error.getErrorCode()
                                + " | "
                                + error.getDescription()
                );
            }
        });

        /*
         * IMPORTANT:
         *
         * Old:
         * file:///android_asset/www/index.html
         *
         * New:
         * https://appassets.androidplatform.net/assets/www/index.html
         */
        String appUrl =
                "https://appassets.androidplatform.net/assets/www/index.html";

        Log.d(
                TAG,
                "Loading app: " + appUrl
        );

        mWebView.loadUrl(appUrl);
    }

    private void setupImmersiveMode() {

        getWindow()
                .getDecorView()
                .setSystemUiVisibility(
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                                | View.SYSTEM_UI_FLAG_FULLSCREEN
                                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                );
    }

    private void setupAudio() {

        AudioAttributes audioAttributes =
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(
                                AudioAttributes.CONTENT_TYPE_SONIFICATION
                        )
                        .build();

        mSoundPool =
                new SoundPool.Builder()
                        .setMaxStreams(3)
                        .setAudioAttributes(audioAttributes)
                        .build();

        // The web layer synthesizes alarm audio.
        // No res/raw asset is required.
    }

    @Override
    protected void onDestroy() {

        unregisterReceiver(mBatteryReceiver);

        if (mSoundPool != null) {
            mSoundPool.release();
        }

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

            if (mVibrator == null || !mVibrator.hasVibrator()) {
                return;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {

                mVibrator.vibrate(
                        VibrationEffect.createOneShot(
                                durationMs,
                                VibrationEffect.DEFAULT_AMPLITUDE
                        )
                );

            } else {

                mVibrator.vibrate(durationMs);
            }
        }

        @JavascriptInterface
        public void setScreenBrightness(
                float brightnessRatio
        ) {

            runOnUiThread(() -> {

                WindowManager.LayoutParams layout =
                        getWindow().getAttributes();

                layout.screenBrightness =
                        Math.max(
                                0.01f,
                                Math.min(
                                        1.0f,
                                        brightnessRatio
                                )
                        );

                getWindow().setAttributes(layout);
            });
        }

        @JavascriptInterface
        public void setKeepScreenAwake(
                boolean keepAwake
        ) {

            runOnUiThread(() -> {

                if (keepAwake) {

                    getWindow().addFlags(
                            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    );

                } else {

                    getWindow().clearFlags(
                            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    );
                }
            });
        }

        @JavascriptInterface
        public void scheduleExactAlarm(
                String alarmId,
                long triggerAtMillis,
                String label
        ) {

            AlarmScheduler.scheduleExact(
                    context,
                    alarmId,
                    triggerAtMillis,
                    label
            );
        }

        @JavascriptInterface
        public void cancelAlarm(
                String alarmId
        ) {

            AlarmScheduler.cancel(
                    context,
                    alarmId
            );
        }

        @JavascriptInterface
        public void playAlarmRingtone() {

            // Alarm audio is synthesized by the bundled web app.
        }

        @JavascriptInterface
        public void stopAlarmRingtone() {

            if (mSoundPool != null) {
                mSoundPool.autoPause();
            }
        }
    }
}