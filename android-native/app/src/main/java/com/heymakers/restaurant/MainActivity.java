package com.heymakers.restaurant;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    static final String APP_URL = "https://fancy-gaufre-9ff82a.netlify.app/restaurante/";
    private static final String APP_HOST = "fancy-gaufre-9ff82a.netlify.app";
    private static final String APP_PATH = "/restaurante/";
    private static final int FILE_PICKER_REQUEST = 4201;
    static final int BLUETOOTH_PERMISSION_REQUEST = 4202;

    private WebView webView;
    private ValueCallback<Uri[]> filePickerCallback;
    private BluetoothPrinterBridge printerBridge;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window window = getWindow();
        window.setStatusBarColor(0xFF173D33);
        window.setNavigationBarColor(0xFF173D33);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        printerBridge = new BluetoothPrinterBridge(this, webView);
        webView.addJavascriptInterface(printerBridge, "MakersPrinter");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (filePickerCallback != null) filePickerCallback.onReceiveValue(null);
                filePickerCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Selecciona un archivo"),
                            FILE_PICKER_REQUEST);
                } catch (Exception e) {
                    filePickerCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript(
                        "document.querySelectorAll('a.androidApkLink,#pwaInstall').forEach(e=>e.hidden=true);"
                                + "const updateButton=document.getElementById('androidUpdateButton');"
                                + "if(updateButton)updateButton.hidden=false;",
                        null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isAppPage(uri)) {
                    return uri.getPath() != null && uri.getPath().endsWith("/Makers-Restaurant.apk");
                }
                if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (isAppPage(uri)) {
                    return uri.getPath() != null && uri.getPath().endsWith("/Makers-Restaurant.apk");
                }
                if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
                }
                return true;
            }
        });
        try {
            webView.loadDataWithBaseURL(APP_URL, readBundledPage(), "text/html", "UTF-8", null);
        } catch (IOException e) {
            webView.loadUrl(APP_URL);
        }
    }

    private String readBundledPage() throws IOException {
        try (InputStream input = getAssets().open("www/index.html");
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private boolean isAppPage(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && APP_HOST.equalsIgnoreCase(uri.getHost())
                && uri.getPath() != null
                && uri.getPath().startsWith(APP_PATH);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == BLUETOOTH_PERMISSION_REQUEST && printerBridge != null) {
            boolean granted = results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
            printerBridge.permissionResult(granted);
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICKER_REQUEST && filePickerCallback != null) {
            Uri[] selected = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                selected = new Uri[]{data.getData()};
            }
            filePickerCallback.onReceiveValue(selected);
            filePickerCallback = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (printerBridge != null) printerBridge.close();
        if (webView != null) {
            webView.removeJavascriptInterface("MakersPrinter");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
