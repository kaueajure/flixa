/**
 * The player only receives capabilities required for video playback.
 * Everything not listed here remains blocked by the iframe sandbox, including
 * popups, escaping popups, top navigation, downloads, forms and modal dialogs.
 */
export const PROTECTED_PLAYER_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-presentation",
  "allow-orientation-lock",
].join(" ");

/**
 * Keep playback features available while explicitly denying privacy-sensitive
 * and advertising-related browser APIs to third-party players.
 */
export const PROTECTED_PLAYER_ALLOW = [
  "autoplay *",
  "fullscreen *",
  "encrypted-media *",
  "picture-in-picture *",
  "attribution-reporting 'none'",
  "browsing-topics 'none'",
  "camera 'none'",
  "clipboard-read 'none'",
  "clipboard-write 'none'",
  "display-capture 'none'",
  "geolocation 'none'",
  "hid 'none'",
  "identity-credentials-get 'none'",
  "local-fonts 'none'",
  "microphone 'none'",
  "midi 'none'",
  "otp-credentials 'none'",
  "payment 'none'",
  "publickey-credentials-create 'none'",
  "publickey-credentials-get 'none'",
  "serial 'none'",
  "usb 'none'",
  "web-share 'none'",
  "window-management 'none'",
  "xr-spatial-tracking 'none'",
].join("; ");

export const PROTECTED_PLAYER_REFERRER_POLICY = "no-referrer" as const;
