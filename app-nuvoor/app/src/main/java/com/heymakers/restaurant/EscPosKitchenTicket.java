package com.heymakers.restaurant;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;

final class EscPosKitchenTicket {
    enum Style {
        TITLE(0x11, true, true), SUBTITLE(0x00, true, true),
        ITEM(0x01, true, false), EMPHASIS(0x00, true, false),
        DETAIL(0x00, false, false), RULE(0x00, false, false);

        final int size;
        final boolean bold;
        final boolean centered;

        Style(int size, boolean bold, boolean centered) {
            this.size = size;
            this.bold = bold;
            this.centered = centered;
        }
    }

    static final class Line {
        final Style style;
        final String text;

        Line(Style style, String text) {
            this.style = style;
            this.text = text;
        }
    }

    static byte[] encode(List<Line> lines, int paperWidthMm, int advanceLines) throws IOException {
        int columns = paperWidthMm <= 58 ? 32 : 48;
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(new byte[]{0x1B, 0x40}); // ESC @: iniciar impresora.
        for (Line line : lines) {
            Style style = line.style;
            out.write(new byte[]{0x1B, 0x61, (byte) (style.centered ? 1 : 0)});
            out.write(new byte[]{0x1B, 0x45, (byte) (style.bold ? 1 : 0)});
            out.write(new byte[]{0x1D, 0x21, (byte) style.size});
            if (style == Style.RULE) {
                for (int i = 0; i < columns; i++) out.write('-');
                out.write('\n');
                continue;
            }
            int usableColumns = style == Style.TITLE ? columns / 2 : columns;
            for (String row : normalizeAndWrap(line.text, usableColumns)) {
                out.write(row.getBytes(StandardCharsets.US_ASCII));
                out.write('\n');
            }
        }
        out.write(new byte[]{0x1D, 0x21, 0, 0x1B, 0x45, 0, 0x1B, 0x61, 0});
        for (int i = 0; i < advanceLines; i++) out.write('\n');
        return out.toByteArray();
    }

    static void send(OutputStream output, byte[] ticket, boolean cut) throws IOException, InterruptedException {
        // Los bloques cortos dejan margen al búfer de recepción Bluetooth.
        final int blockSize = 128;
        for (int offset = 0; offset < ticket.length; offset += blockSize) {
            output.write(ticket, offset, Math.min(blockSize, ticket.length - offset));
            output.flush();
            if (offset + blockSize < ticket.length) Thread.sleep(35);
        }
        if (cut) {
            Thread.sleep(180);
            output.write(new byte[]{0x1D, 0x56, 0x01}); // GS V 1: corte parcial.
            output.flush();
        }
        // El socket permanece abierto mientras salen los últimos bytes.
        Thread.sleep(250);
    }

    static String[] normalizeAndWrap(String input, int columns) {
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
}
