from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
s=getSampleStyleSheet(); s.add(ParagraphStyle(name='B',fontName='Helvetica',fontSize=10,leading=14,spaceAfter=10))
story=[]
def p(t,st='B'): story.append(Paragraph(t,s[st]))
p('GRIS | Finiquito actualizado','Title')
p('Estimación según hoja proporcionada · 25 de octubre de 2026')
p('<b>Base de la hoja: $1,175.34 MXN</b>','Heading2')
p('Se adoptan 44 días efectivamente trabajados y $300 por día. La hoja incluye vacaciones proporcionales con base anual de 14 días y prima vacacional del 25%. El resultado se calcula sin redondeos intermedios; por ello difiere del total manuscrito de $1,175.33.')
rows=[['Concepto','Operación','Importe*'],['Aguinaldo proporcional','15 / 365 × 44 × $300','$542.47'],['Vacaciones (base de la hoja)','14 / 365 × 44 × $300','$506.30'],['Prima vacacional','Vacaciones sin redondear × 25%','$126.58'],['TOTAL (sin redondeos intermedios)','',' $1,175.34']]
t=Table(rows,colWidths=[215,205,90]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#183D4C')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#EFF4F5'),colors.white])]))
story.append(t);story.append(Spacer(1,10))
p('* Los conceptos se muestran a centavos. Su suma visual es $1,175.35; el total sobre cifras completas es $1,175.34. La diferencia de $0.01 corresponde al redondeo.')
p('<b>Antigüedad y vacaciones: dato por confirmar</b>','Heading2')
p('La base de 14 días corresponde al segundo año; al tercero corresponden 16 días. Con los mismos 44 días como supuesto para el periodo vacacional pendiente, la alternativa de 16 días arroja: vacaciones $578.63, prima $144.66 y aguinaldo $542.47; total sin redondeos intermedios <b>$1,265.75</b>. La suma de conceptos mostrados difiere en $0.01 por redondeo. Las fechas de ingreso y el periodo vacacional adeudado determinan qué escenario aplica.')
p('<b>Conciliación de los datos nuevos</b>','Heading2')
p('Se registran 8 faltas y 7 retardos. Los 44 días se toman como asistencia neta y las faltas no se restan otra vez. La hoja dice aproximadamente 53 domingos al año, pero 53 menos 8 son 45, no 44. Además, 2026 tiene 52 domingos; 52 menos 8 sí son 44 para el año completo. Los 44 domingos no coinciden con el periodo enero-20 de octubre de 2026 usado antes (42 domingos posibles). Es necesario confirmar a qué fechas corresponden esos 44 días.')
p('Este documento sustituye el escenario previo de 37 días por el dato expreso de 44 de la hoja. También incorpora vacaciones como nuevo supuesto de cálculo, aunque antes se informó que no había adeudo. Si esas vacaciones y su prima ya se cubrieron, no se pagan de nuevo: sólo quedaría el aguinaldo base de $542.47, sujeto a confirmar el periodo y los pagos previos.')
p('No se incluyen salarios pendientes (se informó que no existen), multas por retardos ni indemnización por despido. Queda por conciliar aguinaldo ya pagado, prima dominical y descanso proporcional. Importes brutos provisionales, no recibo ni convenio de pago.')
p('<b>Fuente:</b> Ley Federal del Trabajo, arts. 71-72, 76-80, 87 y 107. <link href="https://profedet.gob.mx/micrositio/index.php/vacaciones" color="#146477">PROFEDET: vacaciones por antigüedad</link>.')
SimpleDocTemplate('output/pdf/finiquito_gris.pdf',pagesize=A4,leftMargin=38,rightMargin=38,topMargin=28,bottomMargin=28).build(story)
from pypdf import PdfReader
print('Pages:',len(PdfReader('output/pdf/finiquito_gris.pdf').pages))
