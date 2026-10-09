#!/usr/bin/env python3
"""블로그 원고를 저장소 형식(posts/<slug>/)으로 정리한다.
- blogger-post.html의 노란 [이미지 n] 상자를 jsDelivr 이미지 태그로 바꾼다.
- meta.json(title, slugTitle, labels, searchDescription)을 만든다.
사용: prepare.py --src blogger-post.html --images DIR --slug SLUG --title T --labels a,b --desc D --repo DIR
"""
import argparse, json, re, shutil, os, html as H

ap = argparse.ArgumentParser()
ap.add_argument('--src', required=True); ap.add_argument('--images', required=True)
ap.add_argument('--slug', required=True); ap.add_argument('--title', required=True)
ap.add_argument('--labels', default=''); ap.add_argument('--desc', default='')
ap.add_argument('--repo', required=True)
ap.add_argument('--owner', default='keyword2030-eduleaders'); ap.add_argument('--name', default='eduleaders-blog')
a = ap.parse_args()

assert re.fullmatch(r'[a-z0-9-]+', a.slug), 'slug는 영문 소문자·숫자·하이픈만'
out = os.path.join(a.repo, 'posts', a.slug); os.makedirs(out, exist_ok=True)
src = open(a.src, encoding='utf-8').read()
base = f'https://cdn.jsdelivr.net/gh/{a.owner}/{a.name}@main/posts/{a.slug}/'

def repl(m):
    fn, title, alt = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    shutil.copy(os.path.join(a.images, fn), os.path.join(out, fn))
    return (f'<div class="separator" style="clear: both; text-align: center;">'
            f'<a href="{base}{fn}" style="display:block;margin:1.2em 0;text-align:center;">'
            f'<img alt="{H.escape(alt, True)}" title="{H.escape(title, True)}" border="0" '
            f'width="800" height="450" style="max-width:100%;height:auto;" loading="lazy" src="{base}{fn}"></a></div>')

pat = re.compile(r'<div class="imgmark">\[이미지 \d+ · ([^\]]+)\]<br>\s*제목:\s*(.*?)<br>\s*alt:\s*(.*?)</div>', re.S)
post, n = pat.subn(repl, src)
assert 'class="imgmark"' not in post, '처리되지 않은 이미지 상자가 있습니다'
open(os.path.join(out, 'post.html'), 'w', encoding='utf-8').write(post)
meta = {'title': a.title, 'slugTitle': a.slug.replace('-', ' '),
        'labels': [x.strip() for x in a.labels.split(',') if x.strip()],
        'searchDescription': a.desc}
json.dump(meta, open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(f'{out}: 이미지 {n}장, 제목 {len(a.title)}자, 영문 제목 "{meta["slugTitle"]}"')
