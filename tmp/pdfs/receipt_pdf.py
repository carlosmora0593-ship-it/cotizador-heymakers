from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
s=getSampleStyleSheet();s.add(ParagraphStyle(name='B',fontName='Helvetica',fontSize=11,leading=17,spaceAfter=12))
story=[]
def p(t,st='B'):story.append(Paragraph(t,s[st]))
p('RECIBO DE PAGO POR FINIQUITO','Title')
story.append(Spacer(1,18))
p('Morelia, Michoacán, a ______ de __________________ de __________.')
p('<b>Nombre completo de la persona trabajadora:</b><br/>________________________________________________________________')
p('<b>Nombre de la persona empleadora o razón social:</b><br/>________________________________________________________________')
p('Recibí de la persona empleadora señalada la cantidad de <b>$1,175.35 MXN (mil ciento setenta y cinco pesos 35/100 moneda nacional)</b>, por los siguientes conceptos con motivo de mi renuncia voluntaria:')
rows=[['Concepto','Importe'],['Aguinaldo proporcional','$542.47'],['Vacaciones proporcionales','$506.30'],['Prima vacacional (25%)','$126.58'],['TOTAL RECIBIDO','$1,175.35']]
t=Table(rows,colWidths=[370,135]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#183D4C')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTNAME',(0,-1),(-1,-1),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),11),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12),('ALIGN',(1,1),(1,-1),'RIGHT'),('LINEBELOW',(0,-2),(-1,-2),0.6,colors.HexColor('#B8C6CB'))]))
story.append(t);story.append(Spacer(1,20))
p('<b>Periodo al que corresponde el pago:</b><br/>Del __________________________ al __________________________.')
p('<b>Base del cálculo:</b> 44 días trabajados; salario de $300.00 por día; aguinaldo anual de 15 días; vacaciones con base anual de 14 días.')
p('<b>Forma de pago:</b> ______________________________________________')
p('Mi decisión de renunciar obedece a motivos personales y a mi deseo de desarrollar mis habilidades y conocimientos, así como de continuar mi crecimiento profesional en otra empresa. Agradezco la confianza que depositaron en mí durante el tiempo que formé parte de su equipo.')
p('Mi firma acredita exclusivamente la recepción del importe y los conceptos aquí descritos, sin implicar renuncia a derechos laborales ni a diferencias que legalmente correspondan.')
story.append(Spacer(1,18))
sign=Table([['________________________________','________________________________'],['Firma de la persona trabajadora','Firma de la persona empleadora'],['Nombre: _________________________','Nombre: _________________________']],colWidths=[252,253]);sign.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'Helvetica'),('FONTSIZE',(0,0),(-1,-1),10),('ALIGN',(0,0),(-1,-1),'CENTER'),('TOPPADDING',(0,0),(-1,-1),6)]));story.append(sign)
SimpleDocTemplate('output/pdf/finiquito_gris.pdf',pagesize=A4,leftMargin=45,rightMargin=45,topMargin=40,bottomMargin=35).build(story)
from pypdf import PdfReader
print('Pages:',len(PdfReader('output/pdf/finiquito_gris.pdf').pages))


