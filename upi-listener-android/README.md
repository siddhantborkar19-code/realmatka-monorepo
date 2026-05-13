# Real Matka UPI Listener

Dedicated merchant-phone helper app for notification-based UPI auto-credit.

## Setup

1. Install this APK on a dedicated Android phone.
2. Login to the merchant UPI app on that phone, for example Google Pay Business for `9309782081@okbizaxis`.
3. Open `RM UPI Listener`.
4. Set backend URL: `https://api.realmatka.in/api/payments/upi-auto-credit`.
5. Set the same secret as Railway env `UPI_AUTO_CREDIT_SECRET`.
6. Tap `Save Settings`.
7. Tap `Open Notification Access` and enable `RM UPI Listener`.
8. Keep this phone online, charging, and disable battery optimization for this app and the UPI app.

## Backend env

```text
UPI_AUTO_CREDIT_SECRET=strong_random_secret
UPI_AUTO_CREDIT_WINDOW_MINUTES=45
```

Auto-credit only happens when exactly one pending deposit matches the amount and the UTR has not been used before. Ambiguous payments stay for admin review.
