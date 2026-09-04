import 'package:flutter/widgets.dart';

/// The language the app is actually rendering in.
///
/// [preferred] is the choice the user saved, or null when they have never
/// picked one. Null does **not** mean Russian: `MaterialApp.locale` is null
/// too in that case, so Flutter resolves the device locale against
/// `supportedLocales` and the UI comes up in Kazakh, Uzbek or Chinese on a
/// device set to one of those.
///
/// Every language control in the app used to read `currentLocale?.languageCode
/// ?? 'ru'`. On a Kazakh phone that put the checkmark in the auth language
/// picker against "Орысша" and made both Settings screens read "Русский",
/// while every other word on screen was Kazakh — observed on the emulator on
/// 2026-09-04, before the user had touched the picker at all.
String activeLanguageCode(BuildContext context, Locale? preferred) =>
    (preferred ?? Localizations.localeOf(context)).languageCode;
