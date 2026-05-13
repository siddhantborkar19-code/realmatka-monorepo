package in.realmatka.upilistener;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    public static final String PREFS = "rm_upi_listener";
    public static final String KEY_WEBHOOK_URL = "webhook_url";
    public static final String KEY_SECRET = "secret";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 36, 32, 36);

        TextView title = new TextView(this);
        title.setText("RM UPI Listener");
        title.setTextSize(24);
        title.setTextColor(0xff111111);
        title.setPadding(0, 0, 0, 20);
        root.addView(title);

        TextView hint = new TextView(this);
        hint.setText("Merchant phone par UPI credit notifications read karke backend ko secure webhook bhejta hai.");
        hint.setTextSize(14);
        hint.setTextColor(0xff555555);
        hint.setPadding(0, 0, 0, 24);
        root.addView(hint);

        EditText webhookUrl = new EditText(this);
        webhookUrl.setHint("Webhook URL");
        webhookUrl.setSingleLine(true);
        webhookUrl.setText(prefs.getString(KEY_WEBHOOK_URL, "https://api.realmatka.in/api/payments/upi-auto-credit"));
        root.addView(webhookUrl);

        EditText secret = new EditText(this);
        secret.setHint("Webhook Secret");
        secret.setSingleLine(true);
        secret.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        secret.setText(prefs.getString(KEY_SECRET, ""));
        root.addView(secret);

        Button save = new Button(this);
        save.setText("Save Settings");
        root.addView(save);

        Button access = new Button(this);
        access.setText("Open Notification Access");
        root.addView(access);

        TextView status = new TextView(this);
        status.setText("Status: settings ready");
        status.setTextSize(13);
        status.setTextColor(0xff555555);
        status.setPadding(0, 18, 0, 0);
        root.addView(status);

        save.setOnClickListener((View view) -> {
            prefs.edit()
                .putString(KEY_WEBHOOK_URL, webhookUrl.getText().toString().trim())
                .putString(KEY_SECRET, secret.getText().toString().trim())
                .apply();
            status.setText("Status: saved");
        });

        access.setOnClickListener((View view) -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));

        setContentView(root);
    }
}
