# Android Native Shell Architecture & Implementation Guide
## Dedicated Appliance Clock for Android 7.0+ (API 24) Tablets

This architecture provides the native container wrapping the web UI (`Vanilla TS/JS + CSS`), bridging system-level services that are unreliably supported or deprecated in Android 7-era WebViews (e.g. WakeLock API, Battery Status API, background alarms, hardware vibration).

---

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Frontend UI                          │
│   (Flip Clock, Minimal Digital, 7-Segment, Giant Type,     │
│    Dot Matrix, Analog Quartz, Split-Flap, Desk Mode,       │
│    Night Monochrome, Haptics, Timer, Pomodoro, Lab)         │
└──────────────┬──────────────────────────────▲───────────────┘
               │ window.AndroidAppliance      │ JS Callbacks
               ▼                              │
┌─────────────────────────────────────────────────────────────┐
│             Android WebView Native Shell                    │
│   • Android 7.0 Nougat (API 24+) Compatibility             │
│   • WebSettings: Hardware Acceleration, DOM storage         │
│   • Full Immersive Sticky Kiosk Mode (Hide Nav & Status)   │
└──────────────┬──────────────────────────────────────────────┘
               │ Native Android Services
               ▼
┌─────────────────────────────────────────────────────────────┐
│             Android System Platform Services                │
│   • AlarmManager.setExactAndAllowWhileIdle (Doze Bypass)    │
│   • FLAG_KEEP_SCREEN_ON (Rock-solid Hardware Wake Lock)     │
│   • WindowManager.LayoutParams.screenBrightness             │
│   • Vibrator.vibrate(VibrationEffect)                       │
│   • SoundPool / MediaPlayer (Guaranteed Audio Alerts)       │
│   • BatteryManager Intent Sticky Broadcast Receiver         │
│   • BOOT_COMPLETED BroadcastReceiver (Auto-start on boot)   │
└─────────────────────────────────────────────────────────────┘
```

---

### 1. `AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.appliance.clock">

    <!-- Essential Appliance Permissions -->
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.WRITE_SETTINGS" />

    <application
        android:allowBackup="true"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Desk Clock Appliance"
        android:theme="@android:style/Theme.NoTitleBar.Fullscreen">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden"
            android:exported="true"
            android:launchMode="singleInstance"
            android:showWhenLocked="true"
            android:turnScreenOn="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.HOME" />
                <category android:name="android.intent.category.DEFAULT" />
            </intent-filter>
        </activity>

        <!-- Receiver for Boot Auto-Launch -->
        <receiver
            android:name=".BootReceiver"
            android:enabled="true"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
            </intent-filter>
        </receiver>

        <!-- Receiver for Exact Alarm Trigger -->
        <receiver
            android:name=".AlarmReceiver"
            android:exported="false" />

    </application>
</manifest>
```

---

### 2. `MainActivity.java`

```java
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
    private int mBeepSoundId;

    // Sticky Battery Broadcast Receiver
    private final BroadcastReceiver mBatteryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            int status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            boolean isCharging = (status == BatteryManager.BATTERY_STATUS_CHARGING ||
                                  status == BatteryManager.BATTERY_STATUS_FULL);

            final float batteryPct = (level >= 0 && scale > 0) ? (level / (float) scale) * 100f : 100f;

            mWebView.post(new Runnable() {
                @Override
                public void run() {
                    // Send native battery stats directly into web layer
                    mWebView.evaluateJavascript(
                        String.format("window.onNativeBatteryUpdate && window.onNativeBatteryUpdate(%b, %.1f);", isCharging, batteryPct),
                        null
                    );
                }
            });
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep hardware screen awake continuously (Desk Clock Appliance)
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

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
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // Enable hardware layers for fast 60fps CSS 3D transforms
        mWebView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        // Expose JavaScript Interface to Web
        mWebView.addJavascriptInterface(new ApplianceBridge(this), "AndroidAppliance");

        mWebView.setWebViewClient(new WebViewClient());
        // Load bundled local assets or hosted endpoint
        mWebView.loadUrl("file:///android_asset/www/index.html");
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
        mBeepSoundId = mSoundPool.load(this, R.raw.classic_beep, 1);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        unregisterReceiver(mBatteryReceiver);
        if (mSoundPool != null) {
            mSoundPool.release();
        }
    }

    // =========================================================================
    // JavaScript Interface Bridge (window.AndroidAppliance)
    // =========================================================================
    public class ApplianceBridge {
        private final Context context;

        public ApplianceBridge(Context context) {
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
                mVibrator.vibrate(VibrationEffect.createOneShot(durationMs, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                mVibrator.vibrate(durationMs);
            }
        }

        @JavascriptInterface
        public void setScreenBrightness(float brightnessRatio) {
            // brightnessRatio 0.01 (ultra dim) to 1.0 (full brightness)
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    WindowManager.LayoutParams layout = getWindow().getAttributes();
                    layout.screenBrightness = Math.max(0.01f, Math.min(1.0f, brightnessRatio));
                    getWindow().setAttributes(layout);
                }
            });
        }

        @JavascriptInterface
        public void setKeepScreenAwake(boolean keepAwake) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (keepAwake) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
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
            if (mSoundPool != null && mBeepSoundId != 0) {
                mSoundPool.play(mBeepSoundId, 1.0f, 1.0f, 1, -1, 1.0f);
            }
        }

        @JavascriptInterface
        public void stopAlarmRingtone() {
            if (mSoundPool != null) {
                mSoundPool.autoPause();
            }
        }
    }
}
```

---

### 3. `AlarmScheduler.java`

```java
package com.appliance.clock;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmScheduler {

    public static void scheduleExact(Context context, String alarmId, long triggerAtMillis, String label) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra("ALARM_ID", alarmId);
        intent.putExtra("ALARM_LABEL", label);

        int requestCode = alarmId.hashCode();
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            // Guarantees waking up the CPU even during Android Doze mode
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
        }
    }

    public static void cancel(Context context, String alarmId) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        Intent intent = new Intent(context, AlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            alarmId.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
    }
}
```

---

### 4. `BootReceiver.java`

```java
package com.appliance.clock;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(launchIntent);
        }
    }
}
```
