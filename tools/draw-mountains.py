#!/usr/bin/env python3
"""Draw the homepage's engraved mountain panorama as native, static SVG.

Each massif has its own silhouette, ridgeline, glacier, cliffs and talus fans.
Run after editing the composition below; no browser-time generation is needed.
"""
from pathlib import Path
import hashlib
import math
import random

ROOT = Path(__file__).resolve().parent.parent
# Outline coordinates are normalized to each mountain's width and relief.
PROFILES = [
    [(0,.97),(.10,.81),(.17,.68),(.25,.65),(.31,.39),(.37,.43),(.44,.16),(.48,.22),(.54,0),(.59,.21),(.65,.15),(.70,.44),(.78,.49),(.85,.75),(1,1)],
    [(0,1),(.13,.76),(.22,.70),(.26,.35),(.30,.30),(.31,.08),(.39,0),(.47,.03),(.49,.13),(.53,.19),(.55,.56),(.65,.53),(.74,.76),(.83,.72),(1,1)],
    [(0,1),(.13,.79),(.22,.59),(.29,.36),(.36,.19),(.42,.12),(.47,.15),(.53,.06),(.61,0),(.65,.14),(.68,.40),(.75,.43),(.80,.64),(.91,.79),(1,1)],
    [(0,1),(.12,.83),(.21,.62),(.26,.26),(.30,.29),(.34,.10),(.41,.12),(.46,.04),(.51,.17),(.57,.18),(.62,0),(.68,.02),(.72,.11),(.77,.09),(.81,.50),(.90,.74),(1,1)],
    [(0,1),(.12,.85),(.19,.58),(.27,.61),(.32,.35),(.41,.28),(.47,.10),(.52,.13),(.56,0),(.62,.20),(.67,.23),(.72,.51),(.80,.54),(.85,.75),(1,1)],
]

def path(points, close=True):
    return 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x,y in points) + ('Z' if close else '')

def shape(points, fill, **attrs):
    extra=' '.join(f'{k.replace("_","-")}="{v}"' for k,v in attrs.items())
    return f'<path d="{path(points)}" fill="{fill}" {extra}/>'

def line(points, color, width=1, opacity=1):
    return f'<path d="{path(points,False)}" fill="none" stroke="{color}" stroke-width="{width}" opacity="{opacity}"/>'

def mountain(name, x, top, width, base, kind, seed, distant=False):
    rng=random.Random(seed)
    height=base-top
    profile=PROFILES[kind]
    outline=[]
    # Uneven ledges break each long slope into an actual craggy ridgeline.
    for (u,v),(u2,v2) in zip(profile,profile[1:]):
        for j in range(3):
            t=j/3
            outline.append((x+width*(u+(u2-u)*t),top+height*(v+(v2-v)*t)+(rng.uniform(-5,5) if j else 0)))
    outline.append((x+width,base))
    silhouette=outline+[(x+width,base+100),(x,base+100)]
    light,stone,shade,deep,snow=(('#bfc9b4','#aabfaf','#8da99b','#73968a','#f0f0dc') if distant else ('#a2b292','#7e9a86','#557c6c','#3d665b','#f2efd6'))
    clip=f'mountain-{name}'
    out=[f'<g class="mountain-massif" data-massif="{name}">',shape(silhouette,stone),f'<clipPath id="{clip}"><path d="{path(silhouette)}"/></clipPath>',f'<g clip-path="url(#{clip})">']
    peak=min(outline,key=lambda p:p[1]);px,py=peak
    ridge=[peak,(px-width*.045,top+height*.29),(px+width*.035,top+height*.49),(px-width*.025,top+height*.67),(px+width*.12,base+30)]
    out.append(shape([(x,base+70),(x,top-20),peak]+ridge[1:]+[(x+width*.32,base+70)],light))
    out.append(shape(ridge+[(x+width,base+100),(x+width,top-20)],shade))
    # A sunlit buttress on the divide, with an irregular face rather than a triangle.
    out.append(shape(ridge+[(a-width*(.015+.045*i/4),b+height*.035) for i,(a,b) in reversed(list(enumerate(ridge)))], '#c7c8a5' if not distant else '#d2d4b9'))
    # Multiple descending ribs and shadow-filled couloirs across EVERY face.
    for i in range(9 if not distant else 6):
        u=.13+i*.09
        nearest=min(outline,key=lambda p:abs(p[0]-(x+width*u)))
        sx,sy=nearest
        sy+=height*.055
        endx=sx+(sx-px)*.7+rng.uniform(-18,18)
        endy=base+rng.uniform(-20,65)
        spine=[(sx,sy)]
        for j in range(1,6):
            t=j/5
            spine.append((sx+(endx-sx)*t+rng.uniform(-width*.022,width*.022),sy+(endy-sy)*t))
        flank=[(a+width*(.007+.025*j/5),b+height*.015) for j,(a,b) in reversed(list(enumerate(spine)))]
        out.append(shape(spine+flank, deep if i%3==0 else shade, opacity='.24' if distant else '.40'))
        out.append(line([(a-width*.008,b) for a,b in spine],light, .8 if distant else 1.3,.65))
    # Snow follows the entire summit chain, breaking into hanging glaciers.
    cap=[p for p in outline if p[1]<top+height*.30]
    if cap:
        fringe=[]
        for i,(a,b) in enumerate(reversed(cap)):
            drop=height*(.025+.04*rng.random())
            if i%5==2: drop+=height*.075
            fringe.append((a-width*.015,b+drop))
        out.append(shape(cap+fringe,snow))
        # Cool blue folds and exposed rock in the snowfield.
        for i in range(1,len(cap)-1,3):
            a,b=cap[i]
            out.append(shape([(a,b+2),(a-width*.019,b+height*.055),(a+width*.028,b+height*.09),(a+width*.014,b+height*.03)],'#b9cabb',opacity='.85'))
    # Weathered shelves wrap around the mountain; clustered fissures cut across them.
    for j in range(12 if not distant else 7):
        yy=top+height*(.30+j*.053)
        pts=[]
        for i in range(8):
            xx=x+width*(.10+(j%3)*.12+i*.065)
            yy2=yy+height*.065*math.sin(i*.58+j*.35)+rng.uniform(-3,3)
            pts.append((xx,yy2))
        out.append(line(pts,'#dce0be' if j%3 else deep,.7 if distant else 1, .22 if distant else .34))
    # Short strokes etch geological texture into cliff faces without a raster asset.
    engraving=[]
    for i in range(42 if not distant else 19):
        xx=x+width*rng.uniform(.16,.86);yy=top+height*rng.uniform(.29,.88)
        lean=(xx-px)*.025
        engraving.append(f'M{xx:.1f} {yy:.1f}l{lean-2:.1f} {rng.uniform(5,13):.1f} {lean+1:.1f} {rng.uniform(3,10):.1f}')
    out.append(f'<path d="{" ".join(engraving)}" fill="none" stroke="{deep}" stroke-width=".75" opacity=".32"/>')
    # Crushed rock fans soften the transition into the wooded valley floor.
    for i in range(3):
        a=x+width*(.25+i*.24);y=top+height*(.66+i*.035)
        out.append(shape([(a,y),(a-width*.15,base+40),(a+width*.12,base+40)],light,opacity='.26'))
    out.extend(['</g>',line(outline,light,1.2,.75),'</g>'])
    return '\n'.join(out)

def draw():
    out=['<g data-depth="far">','<!-- Engraved summit groups; no undecorated backdrop polygons. -->']
    rear=[(-650,275,410,650,3),(-370,230,420,660,2),(-95,240,390,655,0),(155,185,400,650,3),(425,300,360,670,4),(665,245,410,670,3),(945,130,410,670,0),(1220,250,410,670,2),(1510,195,420,680,3),(1800,245,440,700,1)]
    for i,args in enumerate(rear):out.append(mountain(f'distant-{i}',*args,seed=100+i,distant=True))
    # The phone camera sees several sculpted walls, not just one isolated summit.
    front=[(-580,325,450,760,2),(-260,265,430,740,3),(10,220,460,740,1),(275,315,390,755,3),(480,365,335,745,2),(680,325,360,750,3),(895,245,410,750,0),(1165,270,460,750,1),(1470,320,420,765,4),(1760,290,440,780,3)]
    for i,args in enumerate(front):out.append(mountain(f'granite-{i}',*args,seed=300+i))
    out.append('</g>\n<g data-depth="ridge">')
    foothills=[(-620,540,560,820,2),(-160,505,510,800,4),(220,570,480,810,1),(590,595,480,810,2),(975,550,490,820,4),(1365,550,560,820,1),(1820,580,470,840,2)]
    for i,args in enumerate(foothills):
        # Lower walls have the same strata, with their snow removed below the tree line.
        art=mountain(f'foothill-{i}',*args,seed=600+i,distant=True)
        art=art.replace('#f0f0dc','#b9c4a5').replace('#bfc9b4','#91a583').replace('#aabfaf','#7e997e').replace('#8da99b','#668b73')
        out.append(art)
    out.append('</g>\n')
    return '\n'.join(out)

if __name__=='__main__':
    panorama=draw()
    far,ridge=panorama.split('<g data-depth="ridge">')
    far=far.removeprefix('<g data-depth="far">').rsplit('</g>',1)[0]
    ridge=ridge.rsplit('</g>',1)[0]
    layers=[]
    for name,art in [('far',far),('ridge',ridge)]:
        asset=ROOT/'assets'/f'mountains-{name}.svg'
        asset.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-700 0 3000 1100">\n'+art+'\n</svg>\n')
        version=hashlib.sha256(asset.read_bytes()).hexdigest()[:8]
        layers.append(f'<g data-depth="{name}"><image href="assets/mountains-{name}.svg?v={version}" x="-700" y="0" width="3000" height="1100"/></g>')
    p=ROOT/'index.html';html=p.read_text();a=html.index('<g data-depth="far">');b=html.index('<g data-depth="wood">',a)
    p.write_text(html[:a]+'\n'.join(layers)+'\n'+html[b:])
    print('Redrew 27 detailed massifs as two cached SVG landscape layers.')
