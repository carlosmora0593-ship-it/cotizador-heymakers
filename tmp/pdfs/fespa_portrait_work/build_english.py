from pathlib import Path
from copy import deepcopy
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import ContentStream, NameObject, TextStringObject, ByteStringObject
import re
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable

OUT=Path('output/pdf/Plan_FESPA_Commercial_Proposal_US_English.pdf')
TEMP=Path('tmp/pdfs/fespa_portrait_work/english_base.pdf')
SOURCE=Path(r'C:\Users\hp\Downloads\Plan_FESPA_Propuesta_Comercial_Actualizada.pdf')
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('Arial-Bold',r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial',boldItalic='Arial-Bold')
W,H=A4; M=48; CW=W-2*M
NAVY=colors.HexColor('#202840'); MAG=colors.HexColor('#B51072'); TEAL=colors.HexColor('#008A80'); GRAY=colors.HexColor('#526176'); PALE=colors.HexColor('#F0F3F6'); CYAN=colors.HexColor('#DCEEF0')
styles={
 'body':ParagraphStyle('body',fontName='Arial',fontSize=9,leading=12.2,textColor=NAVY,spaceAfter=8),
 'heading':ParagraphStyle('heading',fontName='Arial-Bold',fontSize=12,leading=15,textColor=MAG,spaceBefore=4,spaceAfter=9),
 'sub':ParagraphStyle('sub',fontName='Arial-Bold',fontSize=10,leading=13,textColor=MAG,spaceBefore=4,spaceAfter=7),
 'small':ParagraphStyle('small',fontName='Arial',fontSize=7.5,leading=10,textColor=GRAY,spaceAfter=8),
 'cell':ParagraphStyle('cell',fontName='Arial',fontSize=8,leading=10.6,textColor=NAVY),
 'title':ParagraphStyle('title',fontName='Arial-Bold',fontSize=22,leading=26,textColor=NAVY,spaceAfter=8),
}
story=[]
def p(text,style='body'): return Paragraph(text,styles[style])
def add(text,style='body'):story.append(p(text,style))
def title(text):add(text,'heading')
def sub(text):add(text,'sub')
def table(rows,widths=None):
    data=[[p(str(c),'cell') for c in row] for row in rows]
    t=Table(data,colWidths=widths or [CW/len(rows[0])]*len(rows[0]),hAlign='LEFT')
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BACKGROUND',(0,0),(-1,0),CYAN),('LINEBELOW',(0,0),(-1,0),.6,MAG),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,PALE]),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story.extend([t,Spacer(1,11)])
def new():story.append(PageBreak())
def source():add('Source: Graphic Show · Integrated Business Plan · Updated figures provided by the organization.','small')

add('GRAPHIC SHOW','title')
add('Business Plan 2027-2029<br/>Consolidation and Regional Growth','heading')
add('Proposal for FESPA México. An update to the previously submitted plan, including historical results, a strategic assessment, and the groundwork for a potential three-year commercial partnership.')
title('1. What Is Graphic Show?')
add('Graphic Show is a trade show specializing in the graphic arts industry, printing, visual communications, and complementary solutions, based in Morelia, Michoacán. Across four consecutive editions from 2023 through 2026, it has connected manufacturers, distributors, suppliers, businesses, and industry professionals.')
add('Its ecosystem includes machinery, equipment, and supplies; print shops, agencies, graphics installation, sublimation, signage, packaging, and labels. Courses, workshops, and conferences complement the exhibition and create networking opportunities during the event and throughout the year.')
add('The priority market covers Michoacán, Guanajuato, and Querétaro, with expansion into Jalisco and west-central Mexico. Its value proposition is to provide access to technology, suppliers, training, and business opportunities through a specialized regional platform.')
sub('Institutional Connections and Audience Reach')
add('<b>Graphic Show is part of CANAGRAF Michoacán.</b> Relationships with the organization’s members have developed through exhibitors, speakers, and promotional activities. Connections with business associations, educational institutions, suppliers, and industry representatives provide a foundation for expanding outreach and connecting with regional buyers.')
add('Graphic Show also maintains close ties with <b>CANAGRAF Guanajuato and CIAGRAF Querétaro.</b> These connections provide a foundation for reaching more businesses and professionals, strengthening its regional presence, and developing collaboration opportunities in the Bajío region.')
add('These relationships represent networking capabilities; each partner’s contributions and participation for 2027 must be formalized through specific agreements and deliverables.','small')
sub('Vision for the Proposal')
add('The proposal is to develop a regional business and specialization platform with FESPA México for 2027-2029. The proposed launch in Morelia would use the existing commercial and operating infrastructure, while remaining open to new venues based on results.')
sub('Historical Funding and Fulfillment of Obligations')
add('Initial expenses were covered by the organizers’ own funds, advance commercial payments, and exchanges of goods and services. The $64,751 obligation incurred in 2024 was paid in 2025 and is included in the expenses reported for that year. Accounts receivable from 2023 and 2024 were collected between 2024 and 2025.')
add('The evaluation of joint activities must include costs, cash flow, and break-even analysis. The historical revenue shown in the following chart does not represent profit.')
new()

chart_locations=[]
class RevenueChart(Flowable):
    width=CW; height=290
    def __init__(self):
        super().__init__();self.width=CW;self.height=290
    def draw(self):
        c=self.canv
        x,y=c.absolutePosition(0,0)
        chart_locations.append((c.getPageNumber()-1,x+38,y+44,.84))
        c.setFont('Arial',8);c.setFillColor(GRAY)
        for v in range(0,1001,200):c.drawRightString(32,44+(445-426.5)*.84+v/1000*(426.5-174.5)*.84,str(v))
        c.saveState();c.translate(8,135);c.rotate(90);c.drawCentredString(0,0,'Thousands of pesos');c.restoreState()
        for xx,label,col in [(40,'Exhibit Space',MAG),(175,'Private Sponsorships',TEAL),(345,'Public Funding',colors.HexColor('#F49B18'))]:
            c.setFillColor(col);c.rect(xx,15,12,5,fill=1,stroke=0);c.setFillColor(NAVY);c.drawString(xx+17,12,label)

title('Revenue and Evolution of the Business Model')
add('2023-2026 results · MXN, including VAT · Revenue, not profit','small')
story.append(RevenueChart())
table([['$3,253,696','97.2%','-5.2% vs. 2025'],['Cumulative revenue across four editions','Commercial revenue in 2026<br/>78.7% in 2023','Change in total revenue in 2026']])
sub('Strategic takeaway: reliance on public funding decreases from 21.3% to 2.8%.')
source();new()

class ParticipationChart(Flowable):
    width=CW;height=400
    def __init__(self):
        super().__init__();self.width=CW;self.height=400
    def draw(self):
        c=self.canv
        def text(x,y,s,size=10,b=False,col=NAVY):c.setFont('Arial-Bold' if b else 'Arial',size);c.setFillColor(col);c.drawString(x,y,s)
        text(0,380,'+11.1% growth',14,True,MAG)
        for v in range(0,41,10):
            yy=180+v*4;c.setStrokeColor(CYAN);c.line(55,yy,440,yy);text(32,yy-3,str(v),8)
        for x,v,yr,col in [(120,36,'2025',NAVY),(300,40,'2026',MAG)]:
            c.setFillColor(col);c.rect(x,180,75,v*4,fill=1,stroke=0);text(x+25,187+v*4,str(v),17,True);text(x+24,163,yr)
        c.saveState();c.translate(12,260);c.rotate(90);text(-40,0,'Participating brands',9);c.restoreState()
        text(0,125,'33.3% retention of the 2025 base',14,True,TEAL)
        for yy,total,rest,col,label in [(80,36,24,colors.HexColor('#E7EAF0'),'2025 base: 36'),(35,40,28,MAG,'2026 edition: 40')]:
            text(0,yy+6,label,9);unit=8
            c.setFillColor(TEAL);c.rect(120,yy,12*unit,23,fill=1,stroke=0)
            c.setFillColor(col);c.rect(216,yy,rest*unit,23,fill=1,stroke=0)
            text(160,yy+7,'12',10,True,colors.white);text(216+rest*unit/2-6,yy+7,str(rest),10,True,colors.white if col==MAG else NAVY)

title('Participation Is Growing; Retention Is the Priority')
add('Brands · 2025-2026 comparison validated by the organization','small')
story.append(ParticipationChart())
add('12 returning brands | 24 brands from 2025 absent in 2026 (66.7%)<br/>28 brands in 2026 did not participate in 2025 (70%): new or returning after an earlier absence; breakdown pending.')
sub('90 distinct brands across the 2023-2026 history')
add('A year-over-year absence does not mean a brand has left permanently. The 12 returning brands account for 30% of the 2026 edition.','small')
source();new()

title('3. Market: Bajío and West-Central Mexico')
add('The regional opportunity combines printing and visual communications with packaging, labels, paper, paperboard, customization, and industrial printing applications. The commercial approach includes both graphic arts suppliers and buying companies in productive industries.')
table([['National benchmark from the original plan','Establishments'],['Printing and related industries','20,818'],['Paperboard and paper','8,345'],['Plastic products','6,464']],[CW*.72,CW*.28])
add('Figures retained from the previously submitted document, which cites INEGI, DENUE, May 2026, via Data México. These are national benchmarks for different categories: they must not be added together as a single market or interpreted as counts for the Bajío region. This update does not include a new validation of these counts.','small')
add('Michoacán, Guanajuato, Querétaro, and Jalisco offer opportunities to connect with agribusiness, food, flexible packaging, labeling, and signage. Michoacán’s connection to the Bajío industrial corridor and the Port of Lázaro Cárdenas is a potential differentiator for prospecting manufacturing buyers; their demand must be commercially validated.')
sub('Competitive Landscape and Positioning')
table([['Event','Relationship to Graphic Show'],['EXPOGRÁFICA','Direct competition in machinery, technology, and supplies; its arrival in León in 2028 is particularly relevant.'],['Expo Publicidad Querétaro','Regional overlap in advertising, signage, and visual communications.'],['ExpoPublicitas','National competition for brands and exhibition budgets.'],['FESPA México','Overlap in specialized printing, wide format, and graphics installation; potential for complementary offerings.'],['EXPO PACK México','Indirect competition and a benchmark for packaging segments.']],[CW*.27,CW*.73])
add('EXPOGRÁFICA is announced for September 26-29, 2028, at Poliforum León. This scenario should be incorporated well in advance into scheduling, venue planning, and brand recruitment.')
add('Graphic Show’s differentiation would build on regional proximity, applied training, demonstrations, and buyer connections. Commercial reach must be measured through meetings, opportunities, and results reported by participating brands.')
new()

class TargetsChart(Flowable):
    width=CW;height=455
    def __init__(self):
        super().__init__();self.width=CW;self.height=455
    def draw(self):
        c=self.canv
        def txt(x,y,s,size=9,b=False):c.setFont('Arial-Bold' if b else 'Arial',size);c.setFillColor(NAVY);c.drawString(x,y,s)
        txt(0,438,'Revenue target · millions of MXN',11,True)
        for n in range(10):
            v=n*.2;yy=245+v*90;c.setStrokeColor(CYAN);c.line(40,yy,475,yy);txt(15,yy-3,f'{v:.1f}',7)
        for x,v,year,col,label in [(90,1.16,'2027',MAG,'$1.16 M'),(225,1.30,'2028',TEAL,'$1.30 M'),(360,1.50,'2029',NAVY,'$1.50 M')]:
            c.setFillColor(col);c.rect(x,245,60,v*90,fill=1,stroke=0);txt(x+3,252+v*90,label,10,True);txt(x+17,229,year)
        txt(0,195,'Qualified visitor target',11,True)
        for v in [0,2000,4000,6000]:
            yy=30+v*.022;c.setStrokeColor(CYAN);c.line(50,yy,475,yy);txt(12,yy-3,str(v),7)
        pts=[(70,96),(260,118),(450,140)]
        c.setStrokeColor(TEAL);c.setLineWidth(2)
        for a,b in zip(pts,pts[1:]):c.line(*a,*b)
        for (x,y),v,yr in zip(pts,[3000,4000,5000],['2027','2028','2029']):
            c.setFillColor(TEAL);c.circle(x,y,4,fill=1,stroke=0);txt(x-15,y+12,f'{v:,}',11,True);txt(x-12,12,yr)

title('Targets by Edition: Proposed Growth')
add('2027-2029 · Planning targets subject to budget, commercial capacity, and demand','small')
story.append(TargetsChart())
add('<b>Revenue growth: 2027 +29.6% · 2028 +12.1% · 2029 +15.4%</b>')
add('2026 base: $895,246. The 2028 and 2029 rates are calculated against the prior year’s target.','small')
add('These targets are not contracted revenue. Align the treatment of VAT and the incremental revenue from joint activities.','small')
source();new()

title('Growth Roadmap and Geographic Decisions')
add('2027-2029 proposal · Expansion decisions will be based on commercial, financial, and operating indicators','small')
for year,action,focus,steps,vis,income in [
('2027','CONSOLIDATE','Morelia as the starting point','Win back brands.<br/>Expand packaging and labels.<br/>Implement agreed-upon activities.','3,000','$1.16 M'),
('2028','EXPAND','Evaluate venue and timing','Broaden regional coverage.<br/>Assess EXPOGRÁFICA León.<br/>Compare demand and costs.','4,000','$1.30 M'),
('2029','SCALE','Consolidation or a traveling format','Consolidate profitability.<br/>Add larger-scale suppliers.<br/>Choose a venue based on results.','5,000','$1.50 M')]:
    sub(year+' · '+action)
    table([[focus],[steps],[f'<b>{vis} qualified visitors · {income} in revenue</b>']],[CW])
sub('Criteria for Moving Forward')
add('Brand retention · Qualified buyers · Sponsorships · Accessibility · Costs and profitability')
add('Guanajuato and Querétaro remain potential venue locations; no commitment has been made to either.','small')
source();new()

title('5. Strategic Opportunities and Development Potential')
table([['Development area','Commercial application'],['Commercial expansion','Attract machinery, technology, and supply manufacturers, distributors, and brands through prospecting and follow-up.'],['Diversification','Strengthen packaging, labels, paper, paperboard, industrial printing, and visual communications.'],['Regional reach','Attract businesses and buyers from Michoacán, Guanajuato, Querétaro, and Jalisco.'],['Specialized experiences','Integrate training, demonstrations, and business networking that increase value for brands.']],[CW*.28,CW*.72])
sub('SWOT Analysis')
table([['Strengths','Opportunities'],['Four consecutive editions; 90 distinct brands; event production and sales experience; a platform in Morelia; business and institutional relationships.','Specialized printing, packaging, labels, and customization; educational programs and demonstrations; potential collaboration with FESPA; regional expansion.'],['<b>Weaknesses</b>','<b>Threats</b>'],['Limited budget; need to professionalize prospecting and follow-up; year-over-year retention of 33.3%; buyer registration and measurement need improvement.','Larger-scale exhibitions; EXPOGRÁFICA 2028 in León; competition for dates and budgets; rising operating costs.']])
sub('Priority: Retention and Qualified Buyers')
add('Improving repeat participation must become a measurable commercial goal. The proposal is to segment the 90 historical brands, record reasons for nonparticipation, develop win-back offers, and follow up after each edition.')
add('Outreach should prioritize people with purchasing responsibility and intent. Measuring meetings and reported opportunities will help demonstrate value to exhibitors and guide renewals, together with technical content and specialized experiences.')
add('The 2029 vision is to consolidate a sustainable regional platform that connects technology supply with demand from productive industries. Profitability must be demonstrated through costs, cash flow, and break-even analysis; historical revenue does not equal profit.')
new()

title('6. Collaboration Opportunities: Graphic Show and FESPA')
add('The proposal is to negotiate a strategic and commercial partnership for 2027-2029 to develop specialized activities and business opportunities with active participation from both organizations. The current proposal gives concrete form to the exploratory opportunities in the previously submitted plan.')
add('<b>FESPA Summit Bajío (proposed name).</b> A paid-admission educational event featuring experts and technical content for the region. The model would include admission sales and sponsorships, with the budget and feasibility determined jointly.')
add('<b>Regional Wrap Competition.</b> A graphics and vinyl application activity with technical support subject to FESPA’s authorization. The format, rules, identity, and scope would be defined jointly. The earlier proposal to host Wrap Masters remains an option to explore, without presuming official status or international qualification.')
add('<b>Specialized meetings.</b> Connections among manufacturers, suppliers, and buyers would be integrated into the program and commercial outreach. The possible creation of a FESPA Michoacán chapter, mentioned in the earlier document, remains an additional exploratory initiative, subject to FESPA’s interest and authorization.')
sub('Contributions and Value for Both Organizations')
table([['Graphic Show would contribute','FESPA México would contribute'],['Exhibition platform; regional knowledge; commercial and institutional relationships; local coordination; production; outreach and sales.','Educational and technical expertise; operating models; specialists and brand connections; authorized endorsement; participation in business development.']])
add('For FESPA, the proposal offers a path to commercial presence, content, and new regional relationships through an existing platform. For Graphic Show, it would strengthen specialization, audience reach, and its value proposition. Both parties would participate in developing offerings with measurable financial results.')
sub('Brand Introductions and Commission on Closed Sales')
add('What We Need.','sub')
add('An additional arrangement is proposed in which <b>FESPA introduces Graphic Show to prospective brands</b> interested in exhibit space, sponsorships, or other commercial opportunities. <b>Graphic Show would handle follow-up, negotiation, and closing the sale.</b>')
add('For each closed sale resulting from such an introduction, <b>FESPA would receive a percentage commission agreed upon by both parties.</b> The parties would agree in advance on how referred prospects are identified, the calculation basis, and commission payment terms. This arrangement ties compensation to concrete sales results.')
new()

title('7. Commercial Collaboration Proposal')
add('We propose a <b>three-year commercial collaboration agreement, from 2027 through 2029,</b> between Graphic Show and FESPA México that defines the joint activities, each organization’s responsibilities, and the financial terms of its participation.')
add('The proposal includes two initial activities: a Summit and a regional wrap competition. During the three years, the organizations may agree on additional activities.')
table([['Element','Proposal'],['Term','Three years: 2027, 2028, and 2029'],['Direction','Shared decisions on joint activities'],['Sales and marketing','Both organizations participate in ticket sales, sponsorship acquisition, and brand introductions'],['Revenue sources','Summit admissions, sponsorships, commercial participation by brands, and possible competitor registration fees'],['Costs','Budgets prepared jointly based on each activity’s technical and operating requirements'],['Allocation of financial results','Financial terms agreed upon by both parties, based on each organization’s contributions, responsibilities, and risks'],['Oversight','A committee with representatives from both organizations, performance indicators, and periodic evaluations'],['Growth','New activities and potential venues approved by both organizations']],[CW*.27,CW*.73])
add('The agreement must establish both organizations’ commitments from the outset to sustain the collaboration over the three years.')
add('To define contributions and financial commitments, we propose preparing the budgets with FESPA based on its experience, operating models, and the requirements of each activity.')
add('Participation percentages, costs, and estimated profits will be defined once both organizations have that information.')
new()

title('8. Implementation and Proposed Decision')
add('The opportunity is to combine Graphic Show’s regional platform with FESPA’s specialized expertise to develop ongoing commercial offerings. The proposed initial approval is to move forward with the joint design and evaluation of the activities, with feasibility confirmed before launch.')
table([['Agreement to develop','Expected outcome'],['Technical and educational scope','Define the program, formats, rules, requirements, and brand authorizations.'],['Joint budget','Specify costs, contributions, cash flow, and break-even point for each activity.'],['Financial model','Agree on obligations, collection mechanisms, and allocation of financial results based on responsibilities and risks.'],['2027 commercial plan','Define sellable inventory, target audiences, sponsorships, owners, and the sales schedule.'],['Governance and indicators','Establish a joint committee, approvals, and results reviews.'],['Regional assessment','Compare demand, timing, costs, and potential venues for 2028-2029.']],[CW*.3,CW*.7])
sub('Success Criteria')
add('Performance would be assessed through exhibitor renewals and win-backs; buyers with the appropriate profile and purchasing intent; reported meetings and opportunities; activity admissions and sponsorships; satisfaction; and financial results for each offering. The current retention baseline of 33.3% will allow progress to be compared over time.')
sub('Business Outlook')
add('Graphic Show has a track record of four consecutive editions in 2023-2026, 90 distinct brands, and more than $3.25 million in cumulative revenue. Its reduced reliance on public funding and the existence of a local platform support evaluating a next stage, accompanied by commercial and operating improvements.')
add('<b>The proposal to FESPA is to develop a three-year commercial relationship, beginning in Morelia in 2027, with specialized activities, shared responsibilities, and growth decisions supported by results.</b>')

def foot(c,doc):
    c.setStrokeColor(MAG);c.setLineWidth(.5);c.line(M,36,W-M,36)
    c.setFillColor(GRAY);c.setFont('Arial',6.5);c.drawString(M,25,'GRAPHIC SHOW | Business Plan 2027-2029 | Proposal for FESPA México');c.drawRightString(W-M,25,str(doc.page))
doc=SimpleDocTemplate(str(TEMP),pagesize=A4,rightMargin=M,leftMargin=M,topMargin=45,bottomMargin=49)
doc.build(story,onFirstPage=foot,onLaterPages=foot)
reader=PdfReader(TEMP); original=PdfReader(SOURCE); writer=PdfWriter()
for i,page in enumerate(reader.pages):
    for idx,x,y,s in chart_locations:
        if idx==i:
            q=deepcopy(original.pages[1]);q.cropbox.lower_left=(75,576-445);q.cropbox.upper_right=(610,576-160)
            content=ContentStream(q.get_contents(),original)
            clean=[];group=None
            for args,op in content.operations:
                if op==b'BT':group=[(args,op)];continue
                if group is not None:
                    group.append((args,op))
                    if op==b'ET':
                        values=[]
                        for aa,oo in group:
                            if oo in (b'Tj',b'TJ'):
                                vals=aa[0] if oo==b'TJ' else aa
                                values.extend(str(v) for v in vals if isinstance(v,(TextStringObject,ByteStringObject)))
                        if re.fullmatch(r'[0-9$,.%\s]*',''.join(values)):clean.extend(group)
                        group=None
                else:clean.append((args,op))
            content.operations=clean;q[NameObject('/Contents')]=content
            page.merge_transformed_page(q,Transformation().scale(s).translate(x-75*s,y-(576-445)*s))
    writer.add_page(page)
writer.add_metadata({'/Title':'Graphic Show - Commercial Proposal for FESPA - US English','/Lang':'en-US'})
with OUT.open('wb') as f:writer.write(f)
print(OUT.resolve());print('Pages:',len(reader.pages))
