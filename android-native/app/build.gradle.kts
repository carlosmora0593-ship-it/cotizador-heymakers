plugins {
    id("com.android.application")
}

android {
    namespace = "com.heymakers.restaurant"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.heymakers.restaurant"
        minSdk = 23
        targetSdk = 35
        versionCode = 101
        versionName = "1.1.0"
    }

    signingConfigs {
        create("makersRelease") {
            val keyPath = providers.environmentVariable("MAKERS_KEYSTORE_PATH").orNull
            val storePass = providers.environmentVariable("MAKERS_KEYSTORE_PASSWORD").orNull
            val alias = providers.environmentVariable("MAKERS_KEY_ALIAS").orNull
            val keyPass = providers.environmentVariable("MAKERS_KEY_PASSWORD").orNull
            if (!keyPath.isNullOrBlank()) {
                storeFile = file(keyPath)
                storePassword = storePass ?: ""
                keyAlias = alias ?: ""
                keyPassword = keyPass ?: ""
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            val hasReleaseKey = !providers.environmentVariable("MAKERS_KEYSTORE_PATH").orNull.isNullOrBlank()
            if (hasReleaseKey) signingConfig = signingConfigs.getByName("makersRelease")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
