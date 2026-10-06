plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
// Managed remains the default; a separate application ID keeps installations isolated.
val standalone = providers.gradleProperty("standalone").map { it.toBooleanStrict() }.getOrElse(false)
if (standalone) layout.buildDirectory.set(layout.projectDirectory.dir("build-standard"))
android {
    namespace = "pl.home.wallpanel"
    compileSdk = 35
    defaultConfig {
        applicationId = if (standalone) "pl.home.wallpanel.standard" else "pl.home.wallpanel"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = if (standalone) "0.1.0-standard" else "0.1.0"
        buildConfigField("boolean", "MANAGED_KIOSK", (!standalone).toString())
        manifestPlaceholders["appLabel"] = if (standalone) "WallDeck Standard" else "WallDeck"
        manifestPlaceholders["managedKiosk"] = (!standalone).toString()
        manifestPlaceholders["excludeFromRecents"] = (!standalone).toString()
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(files("libs/spotify-app-remote-release-0.8.0.aar"))
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.webkit:webkit:1.13.0")
    implementation("androidx.datastore:datastore-preferences:1.1.7")
    implementation("net.java.dev.jna:jna:5.18.1@aar")
    implementation("com.alphacephei:vosk-android:0.3.75@aar")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}

tasks.named("preBuild") {
    doFirst {
        check(file("libs/spotify-app-remote-release-0.8.0.aar").isFile) {
            "Missing Spotify SDK. Run scripts/setup-spotify.ps1 (pinned official SDK with SHA-256 verification)."
        }
    }
}
