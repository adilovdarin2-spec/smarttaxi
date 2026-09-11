# Physical Android install diagnostics — 2026-09-05

## Updated finding

The owner's report is that no installation confirmation appears. Repeating
the same authorized `adb install -r` continued to return
`INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. That message is
not evidence that the owner actually pressed Cancel.

Read-only inspection of the connected Xiaomi `2409BRN2CY` reports Android 16
and HyperOS `OS3.0`. ADB is authorized. Both the system flags and visible
developer-options screen show USB debugging and USB installation enabled;
the separate USB-debugging security-settings switch is also enabled.
Current-user effective/device-policy restrictions are `none`. Guest/template
restrictions in `dumpsys user` do not apply to the current user.

The separate "Установка через USB" management page shows "Нет приложений".
No remembered SmartTaxi allow/deny entry was visible there. The diagnostic
opened/scrolled these settings pages but changed no switch or permission.

## Device-log evidence

The latest failed attempt has this sequence in device-local log time:

- **23:40:15.549:** Xiaomi Security Center logs
  `java.lang.NullPointerException: null cannot be cast to non-null type kotlin.String`
  in `com.miui.common.utils.s`, reached from
  `com.miui.common.base.BaseActivity.onCreate` and `AlertActivity.onCreate`.
- **23:40:15.562:** `com.miui.permcenter.install.AdbInstallActivity` is finishing.
- **23:40:16.234:** the Security Center process dies.
- **23:40:39.899:** the package service reports `Install canceled by user` for
  `kz.smarttaxi.app`; the install session fails as user-restricted.

There was no corresponding entry in the queried process's crash buffer.
This is evidence of an unsuccessful Xiaomi confirmation flow, with an
exception during its creation. The exact internal cause and whether the
logged exception directly causes the refusal remain unproven. Do not label
this as a confirmed fatal crash or a deliberate owner cancellation.

## Scope and next step

The pending APK is the previously verified explicit localhost debug artifact:
SHA-256 `157107efdb64d30f2b8401ddeaea91e685fa105664feeeca775ca95d97e9173a`.
No new successful install, native visual QA or actual drive is claimed.

The next non-destructive diagnostic is an owner-controlled phone restart,
then USB reconnection and a single installation attempt with the owner
present. Restart is a troubleshooting step, not a guaranteed fix. Android's
[official app troubleshooting guidance](https://support.google.com/android/answer/2668665?hl=en)
includes restart. If the same flow still fails, retain the installer evidence
for Xiaomi/system-support follow-up; do not blindly repeat the installation.

No phone reboot, app uninstall, app-data clearing, security-app downgrade,
system update, verification bypass, account login or permission mutation was
performed. No production SmartTaxi endpoint/account was used. Application
source and Docker data were unchanged. Only this diagnostic and the current
acceptance/continuation notes were updated; `git diff --check` is the
proportional check for these documentation-only edits.
