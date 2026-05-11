# Backend

Standalone PostgreSQL-backed backend for Real Matka.

## Run locally

```powershell
cd "C:\Users\SDT-WEDDING\Desktop\realmatka app\Backend"
npm install
npm start
```

## Verification

```powershell
cd "C:\Users\SDT-WEDDING\Desktop\realmatka app\Backend"
npm run check:syntax
```

Health endpoint:

- `http://localhost:3000/health`

## Environment

Create `.env.local` from `.env.example` and set your local PostgreSQL connection.

Important variables:

- `DATABASE_PROVIDER=postgres`
- `DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/realmatka`
- `ADMIN_PHONE=9309782081`
- `ADMIN_PASSWORD=your_admin_password`
- `ADMIN_NAME=Siddhant Admin`
- `EXPO_PUBLIC_API_BASE_URL=http://localhost:3000`
- `EXPO_PUBLIC_APP_URL=http://localhost:8081`
- `ADMIN_DOMAIN=http://localhost:5501`
- `PAYMENTS_PUBLIC_ORIGIN=http://localhost:3000`
- `PUBLIC_API_ORIGIN=http://localhost:3000`
- `OTP_PROVIDER=local` for dev, or `OTP_PROVIDER=twilio` for real SMS
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_VERIFY_SERVICE_SID=...`
- `RAZORPAY_KEY_ID=rzp_test_...`
- `RAZORPAY_KEY_SECRET=...`
- `RAZORPAY_WEBHOOK_SECRET=...`

## OTP setup

Current backend already supports these OTP flows:

- user login OTP
- register OTP
- forgot password OTP
- withdraw OTP
- admin authenticator 2FA

## Admin credentials from env

If you set these backend env vars, backend startup will automatically upsert the main admin account from env:

```env
ADMIN_PHONE=9309782081
ADMIN_PASSWORD=621356
ADMIN_NAME=Siddhant Admin
```

Notes:

- backend plain password ko login time par compare nahi karta, startup par uska secure hash store hota hai
- agar aap env me `ADMIN_PASSWORD` change karte ho aur backend restart/redeploy karte ho, admin login password update ho jayega
- `ADMIN_PHONE` aur `ADMIN_PASSWORD` dono saath me set hone chahiye
- production me default seed admin off reh sakta hai, but explicit env admin allowed hai

### Local/dev mode

Use:

```env
OTP_PROVIDER=local
```

In local mode, OTP responses include `devCode`, so testing block nahi hota.

### Real SMS mode with Twilio Verify

Add these in [Backend/.env.local](C:\Users\SDT-WEDDING\Desktop\realmatka app\Backend\.env.local):

```env
OTP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Notes:

- `OTP_PROVIDER=twilio` hone par incomplete credentials ab allowed nahi hain
- missing Twilio values par backend clear config error dega
- Twilio Verify service SMS channel use ho raha hai for all OTP flows

After updating OTP env:

1. backend restart karo
2. admin 2FA login test karo
3. user login/register OTP test karo
4. withdraw OTP test karo

### Real SMS mode with MSG91 OTP Widget

Twilio ki jagah MSG91 live karne ke liye backend/Railway env me ye values set karo:

```env
OTP_PROVIDER=msg91
MSG91_AUTH_KEY=your_msg91_authkey
MSG91_WIDGET_ID=your_msg91_widget_id
MSG91_WIDGET_TOKEN_AUTH=your_msg91_widget_token_auth
EXPO_PUBLIC_APP_SCHEME=realmatka
EXPO_PUBLIC_APP_URL=https://api.realmatka.in
```

Notes:

- `OTP_PROVIDER=msg91` hone par Twilio calls nahi chalengi
- login, register, forgot password aur withdraw OTP widget flow se verify honge
- APK me browser se wapas app open karne ke liye scheme `realmatka` same rehna chahiye

## Razorpay local setup

Add Razorpay test keys in:

- [Backend/.env.local](C:\Users\SDT-WEDDING\Desktop\realmatka app\Backend\.env.local)

Required lines:

```env
PAYMENTS_PUBLIC_ORIGIN=http://localhost:3000
PUBLIC_API_ORIGIN=http://localhost:3000
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
RAZORPAY_WEBHOOK_SECRET=your_test_webhook_secret
```

Where to get them:

- Razorpay Dashboard -> `Settings` -> `API Keys`
- use `Test Mode` keys for local setup
- webhook secret Razorpay webhook config se milega

After adding keys:

1. backend restart karo
2. `user-apk` me `Add Fund` open karo
3. amount enter karke payment link generate karo
4. test payment complete karke app me `Check Status` dabao

## Database setup

Import the schema before first run:

```powershell
psql -U postgres -d realmatka -f "C:\Users\SDT-WEDDING\Desktop\realmatka app\Backend\postgres-schema.sql"
```

## Production notes

- Use `https://` origins for deployed web/mobile clients
- Keep PostgreSQL schema imported in the `realmatka` database
- Restart the backend after env or schema changes
