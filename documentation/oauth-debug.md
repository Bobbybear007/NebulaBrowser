# Google OAuth Sign-in Debug Guide

## Changes Made to Fix Google Sign-in Issues

### 1. User Agent Strategy
- Nebula removes the default Electron token from the UA and appends `Nebula/<version>` for better compatibility while still identifying the app.
- The UA is applied at the session level (main/default sessions) so all tabs/webviews inherit it.
- To debug with Electron visible in UA, set environment variable `NEBULA_DEBUG_ELECTRON_UA=1` before launch.

### 2. Webview and Window Behavior
- Webviews inherit secure defaults from `webPreferences`.
- Popup windows opened by sites (e.g., OAuth) are allowed for `http`/`https` URLs to preserve login flows.

### 3. Session Configuration for OAuth
- Configured session permissions for OAuth compatibility.
- Added cookie change monitoring for Google domains.
- Enhanced request headers (Accept-Language, Accept) and `Referrer-Policy` for OAuth endpoints.

### 4. Unified Session Partitioning
- The main window uses partition `persist:main`, and sessions are configured consistently so auth/session state is shared across tabs.

## Testing Google Sign-in

1. **Open the browser** (already running)
2. **Navigate to** any Google service (Gmail, YouTube, Drive, etc.)
3. **Click Sign In** - you should now see the Google account picker
4. **Select your account** - should take you to password/2FA screen
5. **Complete sign-in** - should successfully sign you in

Note: POST-based navigations are not blocked or intercepted by the main process to avoid stripping request bodies.

## Debug Information

If issues persist, check the Console (F12) for:
- Cookie changes for Google domains
- OAuth redirect flows
- JavaScript errors

## Common OAuth Issues Fixed

- ✅ Missing User Agent (Google blocks unidentified browsers)
- ✅ Third-party cookie restrictions
- ✅ Session isolation between tabs
- ✅ Missing referrer policies
- ✅ Popup blocking for OAuth flows

## What Should Work Now

- Google account picker should appear
- Password entry screens should load
- Two-factor authentication should work
- OAuth redirects should complete properly
- Session should persist across tabs
