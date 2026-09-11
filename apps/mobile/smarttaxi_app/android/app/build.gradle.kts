import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    // A clean CI checkout intentionally has no owner Firebase configuration.
    // Resolve the plugin here, then apply it only when google-services.json is
    // present. Debug compilation stays reproducible while release builds fail
    // closed below instead of silently shipping without push configuration.
    id("com.google.gms.google-services") apply false
}

val hasGoogleServicesConfig = file("google-services.json").exists()
if (hasGoogleServicesConfig) {
    apply(plugin = "com.google.gms.google-services")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "kz.smarttaxi.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "kz.smarttaxi.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        // Google Play requires Android 16 / API 36 for new apps and updates
        // submitted after 31 August 2026.
        targetSdk = 36
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasReleaseKeystore) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        debug {
            manifestPlaceholders["cleartextTraffic"] = "true"
        }
        release {
            manifestPlaceholders["cleartextTraffic"] = "false"
            signingConfig = if (hasReleaseKeystore) signingConfigs.getByName("release") else null
        }
    }
}

gradle.taskGraph.whenReady {
    val requestsRelease = allTasks.any { it.name.contains("Release", ignoreCase = true) }
    if (!hasReleaseKeystore && requestsRelease) {
        throw GradleException("Release signing is required. Create android/key.properties from key.properties.example and point it to a private upload keystore.")
    }
    if (!hasGoogleServicesConfig && requestsRelease) {
        throw GradleException("Release Firebase configuration is required. Add the owner-controlled android/app/google-services.json before building a release artifact.")
    }
}

flutter {
    source = "../.."
}
