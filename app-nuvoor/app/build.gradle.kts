plugins {
    id("com.android.application")
}

android {
    namespace = "mx.nuvoor.app"
    compileSdk = 37
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "mx.nuvoor.app"
        minSdk = 23
        targetSdk = 37
        versionCode = 2
        versionName = "0.1.1"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
