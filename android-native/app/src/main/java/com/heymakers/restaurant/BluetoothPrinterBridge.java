package com.heymakers.restaurant;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class BluetoothPrinterBridge {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final Activity activity;
    private final WebView appWebView;
    private final ExecutorService printQueue = Executors.newSingleThreadExecutor();
    private final ExecutorService updateQueue = Executors.newSingleThreadExecutor();
    private final ArrayList<WebView> systemPrintViews = new ArrayList<>();
    private volatile long pendingUpdateVersion;

    BluetoothPrinterBridge(Activity activity, WebView appWebView) {
        this.activity = activity;
        this.appWebView = appWebView;
    }

    @JavascriptInterface
    public String listPairedDevices() {
        JSONObject result = new JSONObject();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                result.put("error", "permission_required");
                return result.toString();
            }
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null) {
                result.put("error", "bluetooth_unavailable");
                result.put("devices", new JSONArray());
                return result.toString();
            }
            if (!adapter.isEnabled()) {
                result.put("error", "bluetooth_off");
                result.put("devices", new JSONArray());
                return result.toString();
            }
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            ArrayList<BluetoothDevice> devices = new ArrayList<>(bonded);
            Collections.sort(devices, Comparator.comparing(d -> safeDeviceName(d).toLowerCase()));
            JSONArray values = new JSONArray();
            for (BluetoothDevice device : devices) {
                JSONObject item = new JSONObject();
                item.put("name", safeDeviceName(device));
                item.put("address", device.getAddress());
                values.put(item);
            }
            result.put("devices", values);
        } catch (SecurityException e) {
            putError(result, "permission_required");
        } catch (Exception e) {
            putError(result, "device_list_failed");
        }
        return result.toString();
    }

    @JavascriptInterface
    public void requestBluetoothPermission() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                permissionResult(true);
                return;
            }
            if (activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                    == PackageManager.PERMISSION_GRANTED) {
                permissionResult(true);
            } else {
                activity.requestPermissions(
                        new String[]{Manifest.permission.BLUETOOTH_CONNECT},
                        MainActivity.BLUETOOTH_PERMISSION_REQUEST);
            }
        });
    }

    @JavascriptInterface
    public void printText(String jobId, String address, int paperWidthMm, String text) {
        printQueue.execute(() -> {
            String error = null;
            try {
                sendBluetooth(address, paperWidthMm, text);
            } catch (Exception e) {
                error = friendlyError(e);
            }
            report(jobId, error == null, error == null ? "sent" : error);
        });
    }

    @JavascriptInterface
    public void printHtmlSystem(String jobId, String title, int paperWidthMm, String bodyHtml, String ticketCss) {
        activity.runOnUiThread(() -> openSystemPrint(jobId, title, paperWidthMm, bodyHtml, ticketCss));
    }

    @JavascriptInterface
    public void checkForAppUpdate() {
        updateQueue.execute(() -> {
            JSONObject result = new JSONObject();
            HttpURLConnection connection = null;
            try {
                URL url = new URL(MainActivity.APP_URL + "version.json?t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(12000);
                connection.setReadTimeout(12000);
                connection.setUseCaches(false);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("Pragma", "no-cache");
                int responseCode = connection.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK)
                    throw new IOException("No se encontró la versión publicada. Publica primero la actualización.");

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }
                JSONObject published = new JSONObject(body.toString());
                if (!"com.heymakers.restaurant".equals(published.optString("packageName")))
                    throw new IOException("La versión publicada no corresponde a Makers Restaurant.");

                long latestVersion = published.getLong("versionCode");
                long installedVersion = installedVersionCode();
                if (latestVersion > installedVersion) {
                    pendingUpdateVersion = latestVersion;
                    result.put("status", "available");
                    result.put("versionCode", latestVersion);
                    result.put("versionName", published.optString("versionName", "nueva"));
                } else {
                    pendingUpdateVersion = 0L;
                    result.put("status", "current");
                }
            } catch (Exception e) {
                pendingUpdateVersion = 0L;
                try {
                    result.put("status", "error");
                    result.put("message", e.getMessage() == null
                            ? "No se pudo consultar la versión. Revisa tu conexión."
                            : e.getMessage());
                } catch (Exception ignored) { }
            } finally {
                if (connection != null) connection.disconnect();
            }
            reportUpdateResult(result);
        });
    }

    @JavascriptInterface
    public void openAppUpdate() {
        activity.runOnUiThread(() -> {
            JSONObject result = new JSONObject();
            try {
                if (pendingUpdateVersion <= installedVersionCode()) {
                    pendingUpdateVersion = 0L;
                    result.put("status", "error");
                    result.put("message", "Vuelve a buscar; no hay una actualización pendiente.");
                } else {
                    Intent intent = new Intent(Intent.ACTION_VIEW,
                            Uri.parse(MainActivity.APP_URL + "Makers-Restaurant.apk"));
                    intent.addCategory(Intent.CATEGORY_BROWSABLE);
                    activity.startActivity(intent);
                    pendingUpdateVersion = 0L;
                    result.put("status", "download_started");
                }
            } catch (Exception e) {
                try {
                    result.put("status", "error");
                    result.put("message", "No se pudo abrir la descarga del APK.");
                } catch (Exception ignored) { }
            }
            reportUpdateResult(result);
        });
    }

    private long installedVersionCode() throws Exception {
        PackageInfo info = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private void reportUpdateResult(JSONObject result) {
        String js = "window.onMakersAppUpdateResult&&window.onMakersAppUpdateResult("
                + JSONObject.quote(result.toString()) + ");";
        appWebView.post(() -> appWebView.evaluateJavascript(js, null));
    }

    void close() {
        printQueue.shutdownNow();
        updateQueue.shutdownNow();
    }

    private void openSystemPrint(String jobId, String title, int paperWidthMm,
                                 String bodyHtml, String ticketCss) {
        try {
            WebView printView = new WebView(activity);
            printView.getSettings().setJavaScriptEnabled(false);
            printView.setBackgroundColor(android.graphics.Color.WHITE);
            systemPrintViews.add(printView);
            String html = "<!doctype html><html lang=\"es\"><head><meta charset=\"utf-8\"><style>"
                    + ticketCss + "</style></head><body>" + bodyHtml + "</body></html>";
            printView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    try {
                        PrintManager manager = (PrintManager) activity.getSystemService(Activity.PRINT_SERVICE);
                        String safeTitle = title == null || title.trim().isEmpty() ? "Makers Restaurant" : title;
                        PrintAttributes.MediaSize roll = paperWidthMm <= 58
                                ? new PrintAttributes.MediaSize("MAKERS_58", "Rollo 58 mm", 2283, 40000)
                                : new PrintAttributes.MediaSize("MAKERS_80", "Rollo 80 mm", 3150, 40000);
                        PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(roll)
                                .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                        manager.print(safeTitle, printView.createPrintDocumentAdapter(safeTitle), attributes);
                        report(jobId, true, "system-dialog");
                    } catch (Exception e) {
                        report(jobId, false, "No se pudo abrir la impresión del sistema.");
                    }
                }
            });
            printView.loadDataWithBaseURL(MainActivity.APP_URL, html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            report(jobId, false, "No se pudo preparar el documento para imprimir.");
        }
    }

    private void sendBluetooth(String address, int paperWidthMm, String text) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            throw new IOException("Falta permiso Bluetooth. Abre Ajustes de impresión y vuelve a buscar.");
        }
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) throw new IOException("Activa Bluetooth en Android.");
        BluetoothDevice device = adapter.getRemoteDevice(address);
        boolean paired = false;
        for (BluetoothDevice item : adapter.getBondedDevices()) {
            if (address.equalsIgnoreCase(item.getAddress())) { paired = true; break; }
        }
        if (!paired) throw new IOException("La impresora ya no aparece emparejada. Vuelve a vincularla en Android.");

        BluetoothSocket socket = null;
        try {
            socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();
        } catch (IOException secureFailure) {
            if (socket != null) try { socket.close(); } catch (IOException ignored) { }
            socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            socket.connect();
        }
        try (BluetoothSocket connected = socket; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            output.write(new byte[]{0x1B, 0x40});       // ESC @: iniciar impresora
            output.write(new byte[]{0x1B, 0x61, 0x00}); // alineación izquierda
            output.write(new byte[]{0x1B, 0x45, 0x01}); // primera línea en negritas
            String[] lines = normalizeAndWrap(text, paperWidthMm <= 58 ? 32 : 48);
            for (int i = 0; i < lines.length; i++) {
                if (i == 1) output.write(new byte[]{0x1B, 0x45, 0x00});
                output.write(lines[i].getBytes(StandardCharsets.US_ASCII));
                output.write(0x0A);
            }
            output.write(new byte[]{0x0A, 0x0A, 0x0A});
            connected.getOutputStream().write(output.toByteArray());
            connected.getOutputStream().flush();
        }
    }

    private String[] normalizeAndWrap(String input, int columns) {
        String normalized = Normalizer.normalize(input == null ? "" : input, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace("×", "x").replace("·", "-").replace("—", "-")
                .replace("–", "-").replace("“", "\"").replace("”", "\"")
                .replace("’", "'").replace("‘", "'").replace("\u00A0", " ")
                .replaceAll("[^\\x20-\\x7E\\n\\r\\t]", "?");
        ArrayList<String> lines = new ArrayList<>();
        for (String raw : normalized.split("\\r?\\n", -1)) {
            String line = raw.replaceAll("[\\t ]+", " ").trim();
            if (line.isEmpty()) { lines.add(""); continue; }
            StringBuilder current = new StringBuilder();
            for (String word : line.split(" ")) {
                while (word.length() > columns) {
                    if (current.length() > 0) { lines.add(current.toString()); current.setLength(0); }
                    lines.add(word.substring(0, columns));
                    word = word.substring(columns);
                }
                if (current.length() == 0) current.append(word);
                else if (current.length() + 1 + word.length() <= columns) current.append(' ').append(word);
                else { lines.add(current.toString()); current.setLength(0); current.append(word); }
            }
            if (current.length() > 0) lines.add(current.toString());
        }
        return lines.toArray(new String[0]);
    }

    private String safeDeviceName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty() ? "Impresora Bluetooth" : name.trim();
        } catch (SecurityException e) {
            return "Impresora Bluetooth";
        }
    }

    void permissionResult(boolean granted) {
        String code = "window.onMakersPrinterPermissionResult&&window.onMakersPrinterPermissionResult(" + granted + ");";
        appWebView.post(() -> appWebView.evaluateJavascript(code, null));
    }

    private void report(String jobId, boolean ok, String message) {
        String js = "window.onMakersPrinterResult&&window.onMakersPrinterResult("
                + JSONObject.quote(jobId == null ? "" : jobId) + "," + ok + ","
                + JSONObject.quote(message == null ? "" : message) + ");";
        appWebView.post(() -> appWebView.evaluateJavascript(js, null));
    }

    private void putError(JSONObject object, String code) {
        try { object.put("error", code); object.put("devices", new JSONArray()); }
        catch (Exception ignored) { }
    }

    private String friendlyError(Exception error) {
        String message = error.getMessage() == null ? "" : error.getMessage();
        if (message.contains("permission")) return message;
        if (message.toLowerCase().contains("connect") || error instanceof IOException)
            return "No conectó. Confirma que esté encendida, cerca y sin conexión a otro teléfono.";
        return "No se pudo imprimir. Comprueba el emparejamiento y el protocolo ESC/POS.";
    }
}
