package com.heymakers.restaurant;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    static final String APP_START_URL = "https://app.nuvoor.mx/acceso.html?app=android";
    static final String APP_URL = "https://app.nuvoor.mx/restaurante/";
    private static final String APP_HOST = "app.nuvoor.mx";
    private static final int FILE_PICKER_REQUEST = 4201;
    static final int BLUETOOTH_PERMISSION_REQUEST = 4202;
    private static final int SAVE_FILE_REQUEST = 4203;
    private static final int CAMERA_PERMISSION_REQUEST = 4204;

    private static final String APP_PAGE_SETUP = "(function(){"
            + "document.documentElement.dataset.app='android';"
            + "['.androidApkLink','#pwaInstall','#androidUpdateButton'].forEach(function(s){"
            + "document.querySelectorAll(s).forEach(function(e){e.hidden=true;});});"
            + "if(window.__nuvoorBlobDownloadInstalled)return;"
            + "window.__nuvoorBlobDownloadInstalled=true;"
            + "document.addEventListener('click',function(ev){"
            + "var el=ev.target;if(el&&el.nodeType===3)el=el.parentElement;"
            + "var a=el&&el.closest?el.closest('a[download]'):null;"
            + "if(!a||!/^blob:/i.test(a.href||''))return;"
            + "ev.preventDefault();ev.stopPropagation();"
            + "fetch(a.href).then(function(r){return r.blob();}).then(function(blob){"
            + "var reader=new FileReader();reader.onload=function(){"
            + "var data=String(reader.result||'');var comma=data.indexOf(',');"
            + "if(comma<0){window.NuvoorDownload.showError();return;}"
            + "window.NuvoorDownload.saveFile(a.download||'respaldo.json',"
            + "blob.type||'application/octet-stream',data.substring(comma+1));};"
            + "reader.onerror=function(){window.NuvoorDownload.showError();};"
            + "reader.readAsDataURL(blob);}).catch(function(){window.NuvoorDownload.showError();});"
            + "},true);})();";

    private WebView webView;
    private ValueCallback<Uri[]> filePickerCallback;
    private BluetoothPrinterBridge printerBridge;
    private final ExecutorService fileQueue = Executors.newSingleThreadExecutor();
    private byte[] pendingFileBytes;
    private String pendingFileName;
    private String pendingFileMime;
    private final ArrayList<PermissionRequest> pendingCameraRequests = new ArrayList<>();
    private boolean cameraPermissionRequestInFlight;

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
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);

        printerBridge = new BluetoothPrinterBridge(this, webView);
        webView.addJavascriptInterface(printerBridge, "MakersPrinter");
        webView.addJavascriptInterface(new NuvoorDownloadBridge(), "NuvoorDownload");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> pendingCameraRequests.remove(request));
            }

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
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                view.setKeepScreenOn(false);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (isNuvoorPage(Uri.parse(url))) view.evaluateJavascript(APP_PAGE_SETUP, null);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return routeNavigation(request.getUrl());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return routeNavigation(Uri.parse(url));
            }
        });
        webView.loadUrl(APP_START_URL);
    }

    private boolean isAllowedCameraRequest(PermissionRequest request) {
        if (request == null || !isNuvoorPage(request.getOrigin())) return false;
        String[] resources = request.getResources();
        return resources != null && resources.length == 1
                && PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0]);
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        if (!isAllowedCameraRequest(request)) {
            if (request != null) request.deny();
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                || checkSelfPermission(android.Manifest.permission.CAMERA)
                == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            return;
        }
        if (!pendingCameraRequests.contains(request)) pendingCameraRequests.add(request);
        if (cameraPermissionRequestInFlight) return;
        cameraPermissionRequestInFlight = true;
        requestPermissions(new String[]{android.Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
    }

    private void finishCameraPermissionRequest(boolean granted) {
        cameraPermissionRequestInFlight = false;
        ArrayList<PermissionRequest> requests = new ArrayList<>(pendingCameraRequests);
        pendingCameraRequests.clear();
        for (PermissionRequest request : requests) {
            try {
                if (granted && isAllowedCameraRequest(request))
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                else request.deny();
            } catch (Exception ignored) { }
        }
    }

    private boolean isNuvoorPage(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme())
                && APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private boolean routeNavigation(Uri uri) {
        if (isNuvoorPage(uri)) return false;
        String scheme = uri.getScheme();
        if (scheme == null || "javascript".equalsIgnoreCase(scheme)
                || "data".equalsIgnoreCase(scheme) || "blob".equalsIgnoreCase(scheme)
                || "file".equalsIgnoreCase(scheme) || "about".equalsIgnoreCase(scheme)) {
            return true;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (Exception e) {
            showToast("No hay una aplicación para abrir este enlace.");
        }
        return true;
    }

    private final class NuvoorDownloadBridge {
        @JavascriptInterface
        public void saveFile(String name, String mimeType, String base64Data) {
            try {
                byte[] bytes = Base64.decode(base64Data, Base64.DEFAULT);
                String safeName = safeFileName(name);
                String safeMime = mimeType == null || mimeType.trim().isEmpty()
                        ? "application/octet-stream" : mimeType;
                runOnUiThread(() -> saveFileToDevice(safeName, safeMime, bytes));
            } catch (Exception e) {
                showToast("No se pudo preparar el respaldo.");
            }
        }

        @JavascriptInterface
        public void showError() {
            showToast("No se pudo preparar el archivo para descargar.");
        }
    }

    private void saveFileToDevice(String name, String mimeType, byte[] bytes) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            fileQueue.execute(() -> saveToDownloads(name, mimeType, bytes));
            return;
        }

        pendingFileName = name;
        pendingFileMime = mimeType;
        pendingFileBytes = bytes;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            startActivityForResult(intent, SAVE_FILE_REQUEST);
        } catch (Exception e) {
            clearPendingFile();
            showToast("No se pudo abrir Descargas.");
        }
    }

    private void saveToDownloads(String name, String mimeType, byte[] bytes) {
        Uri fileUri = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            fileUri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (fileUri == null) throw new IOException("No se pudo crear el archivo.");

            OutputStream output = getContentResolver().openOutputStream(fileUri, "w");
            if (output == null) throw new IOException("No se pudo abrir el archivo.");
            try (OutputStream stream = output) {
                stream.write(bytes);
            }

            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(fileUri, ready, null, null);
            showToast("Respaldo guardado en Descargas.");
        } catch (Exception e) {
            if (fileUri != null) getContentResolver().delete(fileUri, null, null);
            showToast("No se pudo guardar el respaldo en Descargas.");
        }
    }

    private void writeToSelectedUri(Uri uri, String name, byte[] bytes) {
        fileQueue.execute(() -> {
            try {
                OutputStream output = getContentResolver().openOutputStream(uri, "w");
                if (output == null) throw new IOException("No se pudo abrir el archivo.");
                try (OutputStream stream = output) {
                    stream.write(bytes);
                }
                showToast("Respaldo guardado.");
            } catch (Exception e) {
                showToast("No se pudo guardar el respaldo.");
            }
        });
    }

    private String safeFileName(String name) {
        String value = name == null ? "respaldo.json" : name.trim();
        value = value.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_");
        return value.isEmpty() || ".".equals(value) ? "respaldo.json" : value;
    }

    private void showToast(String message) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    private void clearPendingFile() {
        pendingFileBytes = null;
        pendingFileName = null;
        pendingFileMime = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            boolean granted = results.length > 0
                    && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
            finishCameraPermissionRequest(granted);
            return;
        }
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
            return;
        }
        if (requestCode == SAVE_FILE_REQUEST) {
            byte[] bytes = pendingFileBytes;
            String name = pendingFileName;
            clearPendingFile();
            if (resultCode == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                writeToSelectedUri(data.getData(), name, bytes);
            } else {
                showToast("No se guardó el respaldo.");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.evaluateJavascript("window.dispatchEvent(new Event('nuvoor:restaurant-resume'));", null);
        }
    }

    @Override
    protected void onStop() {
        CookieManager.getInstance().flush();
        super.onStop();
    }

    @Override
    protected void onDestroy() {
        finishCameraPermissionRequest(false);
        if (printerBridge != null) printerBridge.close();
        fileQueue.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("MakersPrinter");
            webView.removeJavascriptInterface("NuvoorDownload");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
