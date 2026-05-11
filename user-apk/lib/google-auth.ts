import { Platform } from "react-native";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleBrowserWindow = Window & {
  google?: {
    accounts?: {
      oauth2?: {
        initTokenClient: (config: {
          client_id: string;
          scope: string;
          prompt?: string;
          callback: (response: GoogleTokenResponse) => void;
        }) => {
          requestAccessToken: (options?: { prompt?: string }) => void;
        };
      };
    };
  };
  __realMatkaGoogleScriptPromise?: Promise<void>;
};

const googleWebClientId = String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "").trim();

function getBrowserWindow() {
  if (typeof window === "undefined") {
    throw new Error("Google login browser me available hai.");
  }
  return window as GoogleBrowserWindow;
}

function loadGoogleScript() {
  const browserWindow = getBrowserWindow();
  if (browserWindow.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (browserWindow.__realMatkaGoogleScriptPromise) {
    return browserWindow.__realMatkaGoogleScriptPromise;
  }

  browserWindow.__realMatkaGoogleScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google login script load nahi hua. Dobara try karo."));
    document.head.appendChild(script);
  });

  return browserWindow.__realMatkaGoogleScriptPromise;
}

export function isGoogleLoginAvailable() {
  return Platform.OS === "web" && typeof window !== "undefined" && Boolean(googleWebClientId);
}

export async function requestGoogleAccessToken() {
  if (Platform.OS !== "web") {
    throw new Error("APK me Google login ke liye native Google SDK setup required hai.");
  }
  if (!isGoogleLoginAvailable()) {
    throw new Error("Google login ke liye EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID env add karo.");
  }

  await loadGoogleScript();
  const browserWindow = getBrowserWindow();
  if (!browserWindow.google?.accounts?.oauth2) {
    throw new Error("Google login initialize nahi hua.");
  }

  return new Promise<string>((resolve, reject) => {
    const tokenClient = browserWindow.google?.accounts?.oauth2?.initTokenClient({
      client_id: googleWebClientId,
      scope: "openid email profile",
      prompt: "select_account",
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error || "Google login failed"));
          return;
        }
        if (!response.access_token) {
          reject(new Error("Google access token receive nahi hua."));
          return;
        }
        resolve(response.access_token);
      }
    });

    tokenClient?.requestAccessToken({ prompt: "select_account" });
  });
}
