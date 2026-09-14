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
# Long shoulders and high saddles make connected ranges rather than narrow towers.
PROFILES = [
    [(0,.96),(.09,.76),(.17,.63),(.25,.40),(.31,.43),(.38,.19),(.43,.23),(.50,0),(.57,.16),(.64,.12),(.72,.34),(.79,.40),(.88,.70),(1,1)],
    [(0,1),(.10,.77),(.19,.58),(.27,.36),(.34,.17),(.42,.06),(.50,0),(.57,.035),(.64,.15),(.72,.32),(.80,.49),(.88,.67),(1,1)],
    [(0,1),(.10,.79),(.20,.53),(.28,.24),(.36,.04),(.43,.14),(.50,.24),(.57,.12),(.64,0),(.72,.18),(.80,.44),(.90,.70),(1,1)],
    [(0,1),(.10,.76),(.20,.48),(.28,.27),(.35,.14),(.41,.18),(.48,.035),(.55,.12),(.62,0),(.70,.16),(.78,.21),(.88,.60),(1,1)],
    [(0,1),(.11,.81),(.22,.59),(.31,.40),(.40,.26),(.48,.10),(.55,0),(.63,.18),(.70,.25),(.79,.48),(.90,.70),(1,1)],
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
    light,stone,shade,deep,snow=(('#d0d1d1','#b9bec4','#9ea8b4','#86919f','#f4f2e9') if distant else ('#aeb0b3','#9099a5','#707e91','#566378','#f3f1e9'))
    clip=f'mountain-{name}'
    out=[f'<g class="mountain-massif" data-massif="{name}">',shape(silhouette,stone),f'<clipPath id="{clip}"><path d="{path(silhouette)}"/></clipPath>',f'<g clip-path="url(#{clip})">']
    peak=min(outline,key=lambda p:p[1]);px,py=peak
    ridge=[peak,(px-width*.045,top+height*.29),(px+width*.035,top+height*.49),(px-width*.025,top+height*.67),(px+width*.12,base+30)]
    out.append(shape([(x,base+70),(x,top-20),peak]+ridge[1:]+[(x+width*.32,base+70)],light))
    out.append(shape(ridge+[(x+width,base+100),(x+width,top-20)],shade))
    # A sunlit buttress on the divide, with an irregular face rather than a triangle.
    out.append(shape(ridge+[(a-width*(.015+.045*i/4),b+height*.035) for i,(a,b) in reversed(list(enumerate(ridge)))], '#c5c2bd' if not distant else '#dedcd6'))
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
            out.append(shape([(a,b+2),(a-width*.019,b+height*.055),(a+width*.028,b+height*.09),(a+width*.014,b+height*.03)],'#c2ccd7',opacity='.85'))
    # Weathered shelves wrap around the mountain; clustered fissures cut across them.
    for j in range(12 if not distant else 7):
        yy=top+height*(.30+j*.053)
        pts=[]
        for i in range(8):
            xx=x+width*(.10+(j%3)*.12+i*.065)
            yy2=yy+height*.065*math.sin(i*.58+j*.35)+rng.uniform(-3,3)
            pts.append((xx,yy2))
        out.append(line(pts,'#dbd9d3' if j%3 else deep,.7 if distant else 1, .22 if distant else .34))
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
    rear=[(-950,255,1100,700,2),(-250,185,1050,700,3),(410,165,1120,705,2),(1150,195,1100,700,0),(1860,235,1050,730,3)]
    for i,args in enumerate(rear):out.append(mountain(f'distant-{i}',*args,seed=100+i,distant=True))
    # Broad foreground shoulders overlap the pale back range. Each main massif
    # is roughly twice its previous width, while its vertical relief stays tall.
    front=[(-1060,320,1050,780,1),(-360,255,1020,780,0),(250,340,990,795,3),(910,275,1100,785,1),(1640,305,1100,810,2)]
    for i,args in enumerate(front):out.append(mountain(f'granite-{i}',*args,seed=300+i))
    out.append('</g>\n<g data-depth="ridge">')
    foothills=[(-1000,565,1280,870,1),(-130,550,1160,870,2),(660,580,1260,885,1),(1520,535,1300,870,3)]
    for i,args in enumerate(foothills):
        # Lower walls have the same strata, with their snow removed below the tree line.
        art=mountain(f'foothill-{i}',*args,seed=600+i,distant=True)
        art=art.replace('#f4f2e9','#b8b6b2').replace('#d0d1d1','#a5a4a4').replace('#b9bec4','#919399').replace('#9ea8b4','#787e88')
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
    print('Redrew 14 broad, gray massifs as two cached SVG landscape layers.')
