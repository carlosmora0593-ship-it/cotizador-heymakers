package com.heymakers.restaurant;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import javax.net.ssl.HttpsURLConnection;

import static com.heymakers.restaurant.EscPosKitchenTicket.Style.*;

public final class KitchenPrintService extends Service {
    private static final String CHANNEL = "nuvoor-cocina";
    private static final String STOP = "mx.nuvoor.app.STOP_KITCHEN";
    private static final int NOTICE = 4206;
    private static volatile boolean running;
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Map<String, JSONArray> waitingForConfirmation = new HashMap<>();
    private final Set<String> blockedRoutes = new HashSet<>();
    private volatile boolean stopping;
    private PowerManager.WakeLock wakeLock;
    private String lastStatus;

    static boolean isRunning() { return running; }

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (running) return START_NOT_STICKY;
        try {
            JSONObject config = new JSONObject(intent.getStringExtra("config"));
            URL base = new URL(config.getString("url"));
            JSONArray printers = config.getJSONArray("printers");
            String token = config.getString("token"), publicKey = config.getString("key");
            if (!"https".equals(base.getProtocol()) || !base.getHost().matches("[a-z0-9]+\\.supabase\\.co")
                    || base.getPort() != -1 || base.getUserInfo() != null || token.length() != 72
                    || printers.length() < 1 || printers.length() > 16) {
                throw new IllegalArgumentException("Configuración de cocina inválida");
            }
            NotificationManager notifications = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= 26) {
                notifications.createNotificationChannel(new NotificationChannel(CHANNEL,
                        "Impresión de cocina", NotificationManager.IMPORTANCE_LOW));
            }
            lastStatus = "Recibiendo comandas incluso con la pantalla apagada";
            startForeground(NOTICE, notification(lastStatus));
            PowerManager power = getSystemService(PowerManager.class);
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Nuvoor:KitchenPrint");
            wakeLock.acquire(TimeUnit.HOURS.toMillis(18));
            running = true;
            worker.scheduleWithFixedDelay(() -> poll(base, publicKey, token, printers), 0, 4, TimeUnit.SECONDS);
        } catch (Exception invalid) {
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private Notification notification(String status) {
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), pendingFlags);
        PendingIntent stop = PendingIntent.getService(this, 0,
                new Intent(this, KitchenPrintService.class).setAction(STOP), pendingFlags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return builder.setSmallIcon(android.R.drawable.stat_notify_sync).setContentTitle("Nuvoor · Cocina")
                .setContentText(status).setStyle(new Notification.BigTextStyle().bigText(status))
                .setContentIntent(open).setOnlyAlertOnce(true).setOngoing(true)
                .addAction(new Notification.Action.Builder(null, "Detener", stop).build()).build();
    }

    private void showStatus(String status) {
        if (stopping || status.equals(lastStatus)) return;
        lastStatus = status;
        getSystemService(NotificationManager.class).notify(NOTICE, notification(status));
    }

    private void poll(URL base, String publicKey, String token, JSONArray printers) {
        if (stopping) return;
        boolean offline = false;
        for (int i = 0; i < printers.length() && !stopping; i++) {
            JSONObject printer = printers.optJSONObject(i);
            if (printer == null) continue;
            String route = printer.optString("ruta");
            if (blockedRoutes.contains(route)) continue;
            try {
                JSONObject args = new JSONObject().put("p_token", token).put("p_ruta", route);
                JSONArray sent = waitingForConfirmation.get(route);
                if (sent != null) {
                    rpc(base, publicKey, "rest_bt_confirma", new JSONObject(args.toString()).put("p_lineas", sent));
                    waitingForConfirmation.remove(route);
                }
                if (stopping) return;
                String payload = rpc(base, publicKey, "rest_bt_toma", args);
                if (payload.isEmpty() || "null".equals(payload)) continue;
                JSONObject order = new JSONObject(payload);
                JSONArray lines = order.getJSONArray("lineas");
                try {
                    boolean cut = printer.optBoolean("corte");
                    byte[] ticket = EscPosKitchenTicket.encode(ticketRows(order),
                            printer.optInt("papel", 80), cut ? 3 : 8);
                    if (ticket.length > 32000) throw new IOException("Comanda demasiado larga");
                    BluetoothPrinterBridge.printKitchenBluetooth(this, printer.getString("mac"), ticket, cut);
                } catch (Exception printError) {
                    // Si se desconectó después de recibir datos, deja el reclamo para revisión manual.
                    blockedRoutes.add(route);
                    continue;
                }
                JSONArray ids = new JSONArray();
                for (int j = 0; j < lines.length(); j++) ids.put(lines.getJSONObject(j).getString("doc_id"));
                waitingForConfirmation.put(route, ids);
                rpc(base, publicKey, "rest_bt_confirma", args.put("p_lineas", ids));
                waitingForConfirmation.remove(route);
            } catch (SecurityException expired) {
                stopping = true;
                stopSelf();
                return;
            } catch (IOException | JSONException retry) {
                offline = true;
            }
        }
        showStatus(!blockedRoutes.isEmpty() ? "Hay una comanda pendiente. Revisa la impresora y vuelve a activar Cocina."
                : offline ? "Esperando conexión con Nuvoor"
                : "Recibiendo comandas incluso con la pantalla apagada");
    }

    private static String rpc(URL base, String publicKey, String procedure, JSONObject body) throws IOException {
        URL endpoint = new URL("https", base.getHost(), "/rest/v1/rpc/" + procedure);
        HttpsURLConnection connection = (HttpsURLConnection) endpoint.openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("apikey", publicKey);
            if (publicKey.startsWith("eyJ")) connection.setRequestProperty("Authorization", "Bearer " + publicKey);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setDoOutput(true);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) throw new SecurityException("Estación no autorizada");
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                for (int size; (size = input.read(buffer)) != -1;) {
                    if (output.size() + size > 1000000) throw new IOException("Respuesta demasiado grande");
                    output.write(buffer, 0, size);
                }
                return new String(output.toByteArray(), StandardCharsets.UTF_8).trim();
            }
        } finally {
            connection.disconnect();
        }
    }

    static List<EscPosKitchenTicket.Line> ticketRows(JSONObject order) throws JSONException {
        List<EscPosKitchenTicket.Line> rows = new ArrayList<>();
        JSONArray lines = order.getJSONArray("lineas");
        boolean takeaway = order.optBoolean("llevar");
        String app = value(order,"app");
        int guests = Math.max(1, order.optInt("personas", 1));
        boolean byGuest = !takeaway && app.isEmpty() && guests > 1;
        rows.add(new EscPosKitchenTicket.Line(SUBTITLE,"COCINA"));
        rows.add(new EscPosKitchenTicket.Line(TITLE,value(order,"mesa").toUpperCase(Locale.ROOT)));
        rows.add(new EscPosKitchenTicket.Line(SUBTITLE,value(order,"folio").replaceFirst("(?i)^CTA-CTA-?(?=\\d)","CTA-")));
        rows.add(new EscPosKitchenTicket.Line(DETAIL,value(order,"fecha") + " " + value(lines.getJSONObject(0),"enviada")));
        if (!value(order,"mesero").isEmpty()) rows.add(new EscPosKitchenTicket.Line(DETAIL,"Atiende: " + value(order,"mesero")));
        if (byGuest) rows.add(new EscPosKitchenTicket.Line(DETAIL,guests + " comensales"));
        rows.add(new EscPosKitchenTicket.Line(SUBTITLE,!app.isEmpty() ? "Pedido por app - " + app
                : takeaway ? "Para llevar" : "Comer dentro"));

        Map<Integer, List<JSONObject>> groups = new TreeMap<>();
        for (int i = 0; i < lines.length(); i++) {
            JSONObject item = lines.getJSONObject(i);
            int guest = item.optInt("comensal", 0);
            int group = byGuest && guest > 0 && guest <= guests ? guest : Integer.MAX_VALUE;
            if (!groups.containsKey(group)) groups.put(group, new ArrayList<>());
            groups.get(group).add(item);
        }
        for (Map.Entry<Integer, List<JSONObject>> group : groups.entrySet()) {
            rows.add(new EscPosKitchenTicket.Line(RULE,""));
            if (byGuest) rows.add(new EscPosKitchenTicket.Line(EMPHASIS,
                    group.getKey() == Integer.MAX_VALUE ? "PARA COMPARTIR" : "COMENSAL " + group.getKey()));
            for (JSONObject item : group.getValue()) {
                rows.add(new EscPosKitchenTicket.Line(ITEM,item.optInt("cant", 1) + " x "
                        + value(item,"nombre").toUpperCase(Locale.ROOT)));
                JSONArray mods = item.optJSONArray("mods");
                if (mods != null) for (int i = 0; i < mods.length(); i++) {
                    JSONObject mod = mods.optJSONObject(i);
                    String text = mod == null ? mods.optString(i, "") : value(mod,"nombre");
                    if (!text.isEmpty()) rows.add(new EscPosKitchenTicket.Line(EMPHASIS,"> " + text));
                }
                if (!value(item,"nota").isEmpty()) rows.add(new EscPosKitchenTicket.Line(EMPHASIS,"Nota: " + value(item,"nota")));
            }
        }
        return rows;
    }

    private static String value(JSONObject object, String key) {
        return object.isNull(key) ? "" : object.optString(key,"");
    }

    private synchronized void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    @Override public void onDestroy() {
        stopping = true;
        running = false;
        worker.shutdown();
        releaseWakeLock();
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        super.onDestroy();
    }
}
