# NovaByte Technologies Frontend

Standalone frontend website for NovaByte Technologies.

## Current Status

- Frontend website is ready for deployment.
- Logo, favicon, social preview image, company contact details, policy pages, quote flow, billing pages, and product showcase pages are included.
- CIN, PAN, and GST are intentionally marked as pending until registration/tax details are officially available.
- The `/pay` route is prepared as a safe placeholder and should be connected only after payment gateway approval and live keys are available.

## Run Locally

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
```

Suggested domain:

```text
novabytetech.in
```

Suggested payment subdomain:

```text
pay.novabytetech.in
```

## Deploy Checklist

1. Create a new Vercel project from this folder.
2. Set production domain to `novabytetech.in`.
3. Add optional payment subdomain `pay.novabytetech.in` after gateway approval.
4. Run `npm run build` before deploy.
5. After company registration, update CIN, PAN, GST, and any official address changes in `app/company-registration/page.tsx`.

## Payment Gateway Next Step

After gateway approval, replace the placeholder `/pay` route with a real payment-link or checkout flow. Keep payment purpose limited to approved software, digital services, maintenance, hosting support, invoices, or account credit for legitimate NovaByte services.
