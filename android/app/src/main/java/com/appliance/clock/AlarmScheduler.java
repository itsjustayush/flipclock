package com.appliance.clock;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class AlarmScheduler {
    private AlarmScheduler() {
    }

    private static PendingIntent createPendingIntent(
            Context context,
            String alarmId,
            String label
    ) {
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.putExtra("ALARM_ID", alarmId);
        intent.putExtra("ALARM_LABEL", label);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        return PendingIntent.getBroadcast(
                context,
                alarmId.hashCode(),
                intent,
                flags
        );
    }

    public static void scheduleExact(
            Context context,
            String alarmId,
            long triggerAtMillis,
            String label
    ) {
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) {
            return;
        }

        PendingIntent pendingIntent =
                createPendingIntent(context, alarmId, label);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
            );
        } else {
            alarmManager.setExact(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
            );
        }
    }

    public static void cancel(Context context, String alarmId) {
        AlarmManager alarmManager =
                (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);

        if (alarmManager == null) {
            return;
        }

        PendingIntent pendingIntent =
                createPendingIntent(context, alarmId, null);

        alarmManager.cancel(pendingIntent);
        pendingIntent.cancel();
    }
}