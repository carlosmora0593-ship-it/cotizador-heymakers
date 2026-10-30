from copy import deepcopy
from pathlib import Path
import runpy
import pdfplumber
from pypdf import PdfReader,PdfWriter,Transformation
from pypdf._page import PageObject

ns=runpy.run_path('tmp/pdfs/fespa_portrait_work/build_vertical.py')
src=Path(r'C:\Users\hp\Downloads\Plan_FESPA_Propuesta_Comercial_Actualizada.pdf')
r=PdfReader(src); layout=pdfplumber.open(src); w=PdfWriter()
def put(dst,p,box,x,top,scale):
    q=deepcopy(p); q.cropbox.lower_left=(box[0],box[1]);q.cropbox.upper_right=(box[2],box[3])
    dst.merge_transformed_page(q,Transformation().scale(scale).translate(x-box[0]*scale,top-box[3]*scale))
for i,p in enumerate(r.pages):
    if float(p.mediabox.width)>float(p.mediabox.height):
        w.add_page(p);continue
    page=ns['edited_page_8'](p,r) if i==7 else p
    chars=[c for c in layout.pages[i].chars if c['top']<760 and c['bottom']>40]
    end=max(c['bottom'] for c in chars)
    ideal=(40+end)/2
    candidates=[]
    for cut in range(int(ideal-65),int(ideal+66)):
        if not any(c['top']-3<cut<c['bottom']+3 for c in chars):
            candidates.append(cut)
    cut=min(candidates,key=lambda c:abs(c-ideal)) if candidates else ideal
    dst=PageObject.create_blank_page(width=1008,height=576)
    scale=.91
    put(dst,page,(48,841.8898-cut,552,805),35,540,scale)
    put(dst,page,(48,65,552,841.8898-cut),520,540,scale)
    put(dst,page,(45,20,555,55),35,38,.91)
    w.add_page(dst)
out=Path('output/pdf/Plan_FESPA_Propuesta_Comercial_Horizontal_Ordenado.pdf')
with out.open('wb') as f:w.write(f)
print(out.resolve())
