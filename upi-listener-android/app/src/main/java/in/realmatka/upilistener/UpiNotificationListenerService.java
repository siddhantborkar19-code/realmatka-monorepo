package in.realmatka.upilistener;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class UpiNotificationListenerService extends NotificationListenerService {
    private static final Pattern AMOUNT_PATTERN = Pattern.compile("(?:Rs\\.?|INR|₹)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern UTR_PATTERN = Pattern.compile("\\b(?:UTR|UPI\\s*Ref(?:erence)?|Ref(?:erence)?\\s*No\\.?|Txn(?:\\.|action)?\\s*ID)\\s*[:#-]?\\s*([A-Z0-9]{8,24})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LONG_NUMBER_PATTERN = Pattern.compile("\\b([0-9]{10,18})\\b");
    private static final Pattern DEPOSIT_REFERENCE_PATTERN = Pattern.compile("\\b(RM[A-Z0-9]{6,20})\\b", Pattern.CASE_INSENSITIVE);

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();
        if (!isSupportedUpiPackage(packageName)) {
            return;
        }

        Bundle extras = sbn.getNotification().extras;
        String title = String.valueOf(extras.getCharSequence("android.title", ""));
        String text = String.valueOf(extras.getCharSequence("android.text", ""));
        String bigText = String.valueOf(extras.getCharSequence("android.bigText", ""));
        String raw = (title + " " + text + " " + bigText).trim();
        String lower = raw.toLowerCase(Locale.ENGLISH);

        if (!lower.contains("credited") && !lower.contains("received") && !lower.contains("paid to you")) {
            return;
        }

        double amount = parseAmount(raw);
        String utr = parseUtr(raw);
        if (amount <= 0 || utr.isEmpty()) {
            return;
        }

        sendWebhook(packageName, amount, utr, raw);
    }

    private boolean isSupportedUpiPackage(String packageName) {
        return "com.google.android.apps.nbu.paisa.user".equals(packageName)
            || "com.phonepe.app".equals(packageName)
            || "net.one97.paytm".equals(packageName)
            || "in.org.npci.upiapp".equals(packageName);
    }

    private double parseAmount(String raw) {
        Matcher matcher = AMOUNT_PATTERN.matcher(raw);
        if (!matcher.find()) {
            return 0;
        }
        try {
            return Double.parseDouble(matcher.group(1));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private String parseUtr(String raw) {
        Matcher matcher = UTR_PATTERN.matcher(raw);
        if (matcher.find()) {
            return clean(matcher.group(1));
        }
        matcher = LONG_NUMBER_PATTERN.matcher(raw);
        return matcher.find() ? clean(matcher.group(1)) : "";
    }

    private String clean(String value) {
        return value == null ? "" : value.trim().toUpperCase(Locale.ENGLISH).replaceAll("[^A-Z0-9]", "");
    }

    private void sendWebhook(String packageName, double amount, String utr, String raw) {
        SharedPreferences prefs = getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
        String webhookUrl = prefs.getString(MainActivity.KEY_WEBHOOK_URL, "");
        String secret = prefs.getString(MainActivity.KEY_SECRET, "");
        if (webhookUrl == null || webhookUrl.trim().isEmpty() || secret == null || secret.trim().isEmpty()) {
            return;
        }

        new Thread(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("packageName", packageName);
                payload.put("appName", appName(packageName));
                payload.put("amount", amount);
                payload.put("utr", utr);
                payload.put("referenceId", parseDepositReference(raw));
                payload.put("rawText", raw);
                payload.put("receivedAt", System.currentTimeMillis());

                byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
                HttpURLConnection connection = (HttpURLConnection) new URL(webhookUrl).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("x-upi-listener-secret", secret);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
                connection.getResponseCode();
                connection.disconnect();
            } catch (Exception ignored) {
                // Notification delivery is best-effort; unmatched payments remain visible for manual review.
            }
        }).start();
    }

    private String appName(String packageName) {
        if ("com.google.android.apps.nbu.paisa.user".equals(packageName)) return "GOOGLE_PAY";
        if ("com.phonepe.app".equals(packageName)) return "PHONEPE";
        if ("net.one97.paytm".equals(packageName)) return "PAYTM";
        if ("in.org.npci.upiapp".equals(packageName)) return "BHIM";
        return packageName;
    }

    private String parseDepositReference(String raw) {
        Matcher matcher = DEPOSIT_REFERENCE_PATTERN.matcher(raw);
        return matcher.find() ? clean(matcher.group(1)) : "";
    }
}
