from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from decimal import Decimal
p='output/pdf/finiquito_gris.pdf'
s=getSampleStyleSheet()
s.add(ParagraphStyle(name='BodyCustom',fontName='Helvetica',fontSize=9,leading=12,spaceAfter=7,textColor=colors.HexColor('#243443')))
s.add(ParagraphStyle(name='SmallCustom',fontName='Helvetica',fontSize=8,leading=10,spaceAfter=5))
story=[]
def para(t,style='BodyCustom'): story.append(Paragraph(t,s[style]))
para('GRIS | Estimación de finiquito','Title')
para('Renuncia voluntaria · Morelia, Michoacán · Pesos mexicanos','BodyCustom')
para('Elaborado el 24 de octubre de 2026. Documento de cálculo preliminar; no constituye recibo de pago ni convenio de terminación.','SmallCustom')
para('<b>Resultado base estimado: $456.16 MXN</b>','Heading2')
para('Corresponde únicamente al aguinaldo proporcional de 2026 bajo los supuestos descritos abajo. El total definitivo queda pendiente de verificar comprobantes y asistencia.')
para('<b>Datos y supuestos</b>')
para('Antigüedad aproximada: 3 años. Primer año: sábados y domingos; dos años posteriores: domingos. Salario informado: $300 por día. Renuncia: 20 de octubre de 2026, interpretando “el martes pasado”. Sin sueldos ni vacaciones pendientes, según lo informado.')
para('Para este escenario se supone que el aguinaldo de años anteriores ya fue pagado, que no hay anticipos del aguinaldo 2026 y que hubo 37 domingos computables: 42 domingos del 1 de enero al 20 de octubre de 2026 menos las 5 inasistencias confirmadas en este año. El pago de aguinaldos previos y la ausencia de anticipos siguen pendientes de confirmar.')
data=[['Concepto','Cálculo / criterio','Importe'],['Aguinaldo 2026, base','300 × 15 × 37 / 365','$456.16'],['Salarios pendientes','Sin adeudo informado','$0.00'],['Vacaciones pendientes','Sin adeudo informado','$0.00'],['Indemnización por despido','Renuncia voluntaria','No aplica'],['Prima de antigüedad','Renuncia con menos de 15 años','No aplica'],['Subtotal base provisional','Antes de ajustes e impuestos','$456.16']]
t=Table(data,colWidths=[141,269,85],repeatRows=1)
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#183D4C')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),8),('LEADING',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#EFF4F5'),colors.white]),('ALIGN',(-1,1),(-1,-1),'RIGHT')]))
story.append(t);story.append(Spacer(1,10))
para('<b>Faltas y retardos</b>')
para('Se informaron 8 ausencias (2 por otro trabajo, 5 sin presentarse y 1 por molestias físicas), y 7 retardos con 5 horas acumuladas. Las 5 inasistencias a domingos de 2026 ya se excluyen del aguinaldo en este escenario, suponiendo que no fueron permisos pagados ni ausencias legalmente computables. Para las otras 3 ausencias y los retardos faltan fechas, justificación y constancia de pago. No se restan $2,400 ni se convierten retardos en multas. Sólo se ajustará nuevamente si se acreditan otras ausencias no computables de 2026; no deben descontarse dos veces.')
para('<b>Conceptos por verificar antes de cerrar</b>')
para('Confirmar aguinaldos anteriores y pagos a cuenta de 2026; prima vacacional ya cubierta; prima dominical y descanso proporcional. Si $300 es la cuota ordinaria y estos adicionales no se pagaron, la prima dominical mínima es $75 por domingo y el descanso proporcional de referencia es $50 por día trabajado (300 / 6). Son conceptos a conciliar y pueden modificar el adeudo y la base salarial; no están sumados al subtotal. No se calculan adeudos de los tres años sin fechas ni comprobantes.')
para('<b>Fuentes y criterio</b>','SmallCustom')
para('Ley Federal del Trabajo, arts. 69-72, 76-80, 87, 107, 110 y 162. Para el ejemplo de jornada discontinua se usa el tiempo efectivamente computable y el mínimo de 15 días de aguinaldo. Revisar prestaciones superiores pactadas y el tratamiento fiscal antes del pago.','SmallCustom')
para('<link href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf" color="#146477">Ley Federal del Trabajo - Cámara de Diputados</link> | <link href="https://www.profedet.gob.mx/micrositio/index.php/renuncia-voluntaria" color="#146477">PROFEDET - Renuncia voluntaria</link>','SmallCustom')
SimpleDocTemplate(p,pagesize=A4,rightMargin=40,leftMargin=40,topMargin=30,bottomMargin=30).build(story)
from pypdf import PdfReader
r=PdfReader(p)
print('Pages:',len(r.pages))

