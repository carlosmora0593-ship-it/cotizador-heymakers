"""Recompose the four slide pages as A3 portrait while retaining vector charts."""

from copy import deepcopy
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter, Transformation
from pypdf._page import PageObject
from pypdf.generic import ContentStream, FloatObject
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A3, portrait
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


SOURCE = Path(r"C:\Users\hp\Downloads\Plan_FESPA_Propuesta_Comercial_Actualizada.pdf")
OUTPUT = Path("output/pdf/Plan_FESPA_Propuesta_Comercial_Vertical.pdf")
PAGE_W, PAGE_H = portrait(A3)
MARGIN = 50
NAVY = HexColor("#22274F")
MAGENTA = HexColor("#D0007A")
TEAL = HexColor("#008A80")
MUTED = HexColor("#51617C")
PALE = HexColor("#F1F3F7")

pdfmetrics.registerFont(TTFont("Arial", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", r"C:\Windows\Fonts\arialbd.ttf"))


def draw(c, text, x, y, size=12, color=NAVY, bold=False):
    c.setFillColor(color)
    c.setFont("Arial-Bold" if bold else "Arial", size)
    c.drawString(x, y, text)


def wrap(c, text, x, y, width, size=12, leading=17, color=NAVY, bold=False):
    font = "Arial-Bold" if bold else "Arial"
    words = text.split()
    line = ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if line and pdfmetrics.stringWidth(candidate, font, size) > width:
            draw(c, line, x, y, size, color, bold)
            y -= leading
            line = word
        else:
            line = candidate
    if line:
        draw(c, line, x, y, size, color, bold)
        y -= leading
    return y


def header(c, title, subtitle, title_size=27):
    draw(c, "GRAPHIC SHOW  /  BUSINESS PLAN 2027-2029", MARGIN, PAGE_H - 50, 13, MAGENTA, True)
    y = wrap(c, title, MARGIN, PAGE_H - 95, PAGE_W - 2 * MARGIN, title_size, 31, NAVY, True)
    wrap(c, subtitle, MARGIN, y - 4, PAGE_W - 2 * MARGIN, 12.5, 18, MUTED)


def footer(c, number):
    draw(
        c,
        "Fuente: Graphic Show · Business Plan integrado · Cifras actualizadas proporcionadas por la organización.",
        MARGIN,
        35,
        9.5,
        MUTED,
    )
    draw(c, str(number), PAGE_W - MARGIN - 10, 35, 10, NAVY)


def make_canvas(draw_fn):
    stream = BytesIO()
    c = canvas.Canvas(stream, pagesize=(PAGE_W, PAGE_H))
    draw_fn(c)
    c.save()
    stream.seek(0)
    return PdfReader(stream).pages[0]


def chart_crop(source, left, top, right, bottom):
    chart = deepcopy(source)
    chart.cropbox.lower_left = (left, 576 - bottom)
    chart.cropbox.upper_right = (right, 576 - top)
    return chart


def place_chart(destination, source, rect, x, y, scale):
    left, top, right, bottom = rect
    crop = chart_crop(source, left, top, right, bottom)
    destination.merge_transformed_page(
        crop,
        Transformation().scale(scale).translate(
            x - left * scale,
            y - (576 - bottom) * scale,
        ),
    )


def slide_2(source):
    def base(c):
        header(c, "Ingresos y evolución del modelo comercial", "Resultados 2023-2026 · MXN, IVA incluido · Ingresos, no utilidades")
        metrics = [
            ("$3,253,696", "Ingresos acumulados en cuatro ediciones", NAVY),
            ("97.2%", "Ingresos comerciales en 2026 · 78.7% en 2023", TEAL),
            ("−5.2% vs. 2025", "Variación de ingresos totales en 2026", NAVY),
        ]
        for index, (value, label, color) in enumerate(metrics):
            x = 50 + index * 248
            c.setFillColor(PALE)
            c.roundRect(x, 330, 235, 138, 10, fill=1, stroke=0)
            draw(c, value, x + 15, 410, 23 if index == 0 else 25, color, True)
            wrap(c, label, x + 15, 378, 205, 12, 16, NAVY)
        wrap(
            c,
            "Lectura estratégica: la dependencia de apoyos públicos disminuye de 21.3% a 2.8%.",
            MARGIN,
            265,
            PAGE_W - 2 * MARGIN,
            17,
            23,
            NAVY,
            True,
        )
        footer(c, 2)

    page = make_canvas(base)
    place_chart(page, source, (18, 155, 620, 500), 50, 535, 1.23)
    return page


def slide_3(source):
    def base(c):
        header(c, "Más participación; la permanencia es la prioridad", "Marcas · Comparativo validado por la organización para 2025-2026")
        draw(c, "+11.1% de crecimiento", 58, 1020, 20, MAGENTA, True)
        draw(c, "33.3% retención de la base 2025", 58, 594, 20, TEAL, True)
        draw(c, "90 marcas distintas en el historial 2023-2026", 58, 195, 21, NAVY, True)
        wrap(
            c,
            "Ausencia interanual no equivale a abandono definitivo. Los 12 repetidos representan 30% de la edición 2026.",
            58,
            162,
            PAGE_W - 116,
            12,
            17,
            MUTED,
        )
        footer(c, 3)

    page = make_canvas(base)
    place_chart(page, source, (40, 190, 335, 430), 185, 625, 1.60)
    place_chart(page, source, (337, 225, 955, 430), 74, 275, 1.17)
    return page


def slide_5(source):
    def base(c):
        header(c, "Metas por edición: crecimiento propuesto", "2027-2029 · Objetivos de planeación sujetos a presupuesto, capacidad comercial y demanda")
        wrap(c, "Crecimiento de ingresos: 2027 +29.6% · 2028 +12.1% · 2029 +15.4%", 50, 175, PAGE_W - 100, 15, 20, NAVY, True)
        wrap(c, "Base 2026: $895,246. Las tasas de 2028 y 2029 se calculan contra la meta del año previo.", 50, 135, PAGE_W - 100, 11, 15, MUTED)
        wrap(c, "Las metas no son ingresos contratados. Homologar IVA y el ingreso incremental de actividades conjuntas.", 50, 100, PAGE_W - 100, 11, 15, MUTED)
        footer(c, 5)

    page = make_canvas(base)
    place_chart(page, source, (38, 150, 485, 430), 100, 635, 1.43)
    place_chart(page, source, (510, 150, 965, 430), 95, 220, 1.40)
    return page


def slide_6():
    cards = [
        ("2027", "CONSOLIDAR", "Morelia como punto de partida", ["Recuperar marcas.", "Ampliar empaque y etiquetas.", "Implementar actividades acordadas."], "3,000 visitantes calificados", "$1.16 M de ingresos", MAGENTA),
        ("2028", "EXPANDIR", "Evaluación de sede y calendario", ["Ampliar cobertura regional.", "Evaluar EXPOGRÁFICA León.", "Comparar demanda y costos."], "4,000 visitantes calificados", "$1.30 M de ingresos", TEAL),
        ("2029", "ESCALAR", "Consolidación o itinerancia", ["Consolidar rentabilidad.", "Sumar proveedores de mayor escala.", "Elegir sede según resultados."], "5,000 visitantes calificados", "$1.50 M de ingresos", NAVY),
    ]

    def base(c):
        header(c, "Ruta de crecimiento y decisiones territoriales", "Propuesta 2027-2029 · La expansión se decidirá con indicadores comerciales, financieros y operativos", 25)
        for index, (year, action, focus, steps, visitors, income, accent) in enumerate(cards):
            top = 1010 - index * 264
            bottom = top - 248
            c.setFillColor(PALE)
            c.roundRect(50, bottom, PAGE_W - 100, 248, 10, fill=1, stroke=0)
            draw(c, year, 70, top - 50, 31, accent, True)
            draw(c, action, 190, top - 46, 19, NAVY, True)
            wrap(c, focus, 70, top - 83, PAGE_W - 140, 14, 18, accent, True)
            for step_i, step in enumerate(steps):
                draw(c, "• " + step, 70, top - 118 - step_i * 22, 12, NAVY)
            c.setStrokeColor(accent)
            c.setLineWidth(1)
            c.line(70, bottom + 55, PAGE_W - 70, bottom + 55)
            draw(c, visitors, 70, bottom + 30, 13, NAVY, True)
            draw(c, income, 420, bottom + 30, 13, NAVY, True)
        draw(c, "Criterios para avanzar", 50, 196, 17, NAVY, True)
        wrap(c, "Retención de marcas · Compradores calificados · Patrocinios · Accesibilidad · Costos y rentabilidad", 50, 174, PAGE_W - 100, 11, 15, NAVY)
        wrap(c, "Guanajuato y Querétaro permanecen como alternativas de sede; su selección no está comprometida.", 50, 137, PAGE_W - 100, 11, 15, MUTED)
        footer(c, 6)

    return make_canvas(base)


def subtitle_overlay(width, height):
    stream = BytesIO()
    c = canvas.Canvas(stream, pagesize=(width, height))
    draw(c, "Lo que necesitamos.", 54, 352, 9, HexColor("#B51072"), True)
    c.save()
    stream.seek(0)
    return PdfReader(stream).pages[0]


def edited_page_8(page, reader):
    edited = deepcopy(page)
    content = ContentStream(edited.get_contents(), reader)
    shifted = 0
    for operands, operator in content.operations:
        if operator != b"cm" or len(operands) != 6:
            continue
        x, y = float(operands[4]), float(operands[5])
        if abs(x - 54) < 0.01 and any(abs(y - v) < 0.01 for v in (318.8898, 258.8898)):
            operands[5] = FloatObject(y - 18)
            shifted += 1
    if shifted != 2:
        raise ValueError(f"Expected two paragraphs below the heading, found {shifted}")
    edited.replace_contents(content)
    edited.merge_page(subtitle_overlay(float(page.mediabox.width), float(page.mediabox.height)))
    return edited


def full_portrait(source):
    page = PageObject.create_blank_page(width=PAGE_W, height=PAGE_H)
    scale = PAGE_W / float(source.mediabox.width)
    page.merge_transformed_page(source, Transformation().scale(scale))
    return page


def main():
    reader = PdfReader(SOURCE)
    writer = PdfWriter()
    for index, source in enumerate(reader.pages):
        if index == 1:
            result = slide_2(source)
        elif index == 2:
            result = slide_3(source)
        elif index == 4:
            result = slide_5(source)
        elif index == 5:
            result = slide_6()
        else:
            result = full_portrait(edited_page_8(source, reader) if index == 7 else source)
        writer.add_page(result)
    writer.add_metadata({"/Title": "Plan FESPA - Propuesta Comercial Vertical"})
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("wb") as stream:
        writer.write(stream)
    print(OUTPUT.resolve())


if __name__ == "__main__":
    main()
