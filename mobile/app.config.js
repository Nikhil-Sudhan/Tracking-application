const base = require("./app.json").expo;
const admin = process.env.APP_VARIANT === "admin";
module.exports = {
  ...base,
  name: admin ? "GroSuite Admin" : "GroSuite Field",
  slug: admin ? "grosuite-admin" : "grosuite-field",
  scheme: admin ? "grosuite-admin" : "fieldpulse",
  extra: { variant: admin ? "admin" : "employee" },
  android: {
    ...base.android,
    package: admin ? "in.grosuite.admin" : "in.grosuite.field",
    ...(admin
      ? {
          permissions: [],
          blockedPermissions: [
            "android.permission.ACCESS_BACKGROUND_LOCATION",
            "android.permission.ACCESS_FINE_LOCATION",
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.FOREGROUND_SERVICE_LOCATION",
            "android.permission.RECEIVE_BOOT_COMPLETED",
          ],
        }
      : {}),
  },
  ios: {
    ...base.ios,
    bundleIdentifier: admin ? "in.grosuite.admin" : "in.grosuite.field",
  },
  plugins: admin ? ["expo-secure-store"] : base.plugins,
};
